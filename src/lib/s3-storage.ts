import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  ListMultipartUploadsCommand,
  HeadObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  NotFound,
  type CompletedPart,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { Readable } from 'stream'

let _s3Client: S3Client | null = null

function getS3Client(): S3Client {
  if (_s3Client) return _s3Client

  const endpoint = process.env.S3_ENDPOINT?.trim()
  const accessKeyId = process.env.S3_ACCESS_KEY_ID?.trim()
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY?.trim()

  if (!endpoint) throw new Error('S3_ENDPOINT is not configured')
  if (!accessKeyId) throw new Error('S3_ACCESS_KEY_ID is not configured')
  if (!secretAccessKey) throw new Error('S3_SECRET_ACCESS_KEY is not configured')

  // Validate S3 endpoint is a proper HTTP(S) URL to prevent SSRF via misconfiguration
  try {
    const parsed = new URL(endpoint)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error(`S3_ENDPOINT must use http or https (got ${parsed.protocol})`)
    }
  } catch (e) {
    if (e instanceof TypeError) {
      throw new Error(`S3_ENDPOINT is not a valid URL: ${endpoint}`)
    }
    throw e
  }

  // forcePathStyle: true for MinIO/Ceph. Set S3_FORCE_PATH_STYLE=false for AWS virtual-hosted buckets.
  const forcePathStyle = process.env.S3_FORCE_PATH_STYLE !== 'false'

  _s3Client = new S3Client({
    endpoint,
    region: process.env.S3_REGION?.trim() || 'us-east-1',
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle,
    // SDK >= 3.729.0 defaults to sending x-amz-checksum-* headers on all requests.
    // MinIO (and Cloudflare R2, DigitalOcean Spaces, Backblaze B2) return 400/501
    // for these headers. WHEN_REQUIRED disables that default for all request types.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  })

  return _s3Client
}

export function getS3Bucket(): string {
  const bucket = process.env.S3_BUCKET
  if (!bucket) throw new Error('S3_BUCKET is not configured')
  return bucket
}

function formatS3Error(operation: string, key: string, err: unknown): Error {
  const e = err as { $metadata?: { httpStatusCode?: number }; message?: string; name?: string }
  const status = e?.$metadata?.httpStatusCode
  const msg = e?.message ?? String(err)
  const name = e?.name ? `${e.name}: ` : ''
  return new Error(`[S3 ${operation}] key="${key}"${status ? ` HTTP ${status}` : ''} ${name}${msg}`)
}

/** Upload a buffer or stream — used by the worker for processed outputs.
 * For files >= 100MB (or unknown-size streams), uses parallel multipart
 * upload. Smaller buffers go via a single PUT. Streams of unknown size are
 * always multipart so we never have to buffer the whole file in RAM.
 *
 * The previous implementation peeked at the stream and concat'd every chunk
 * into a Buffer before deciding — that's a memory bomb on multi-GB transcoded
 * outputs and a hard cap on what the worker can ship.
 */
export async function s3UploadFile(
  key: string,
  body: Readable | Buffer,
  contentType: string = 'application/octet-stream',
  size?: number
): Promise<void> {
  const MULTIPART_THRESHOLD = 100 * 1024 * 1024
  const PART_SIZE = 25 * 1024 * 1024

  // Buffer input
  if (Buffer.isBuffer(body)) {
    if (body.length >= MULTIPART_THRESHOLD) {
      return s3UploadFileMultipart(key, body, contentType, body.length, PART_SIZE)
    }
    try {
      await getS3Client().send(
        new PutObjectCommand({ Bucket: getS3Bucket(), Key: key, Body: body, ContentType: contentType })
      )
    } catch (err) {
      throw formatS3Error('PUT', key, err)
    }
    return
  }

  // Stream input
  // Known size and below threshold → single PUT (SDK handles streaming the body)
  if (size !== undefined && size < MULTIPART_THRESHOLD) {
    try {
      await getS3Client().send(
        new PutObjectCommand({
          Bucket: getS3Bucket(),
          Key: key,
          Body: body,
          ContentType: contentType,
          ContentLength: size,
        })
      )
    } catch (err) {
      throw formatS3Error('PUT', key, err)
    }
    return
  }

  // Known-large or unknown-size stream → multipart, streaming chunk-by-chunk.
  // No upfront buffering; memory use stays bounded to ~PART_SIZE × concurrency.
  return s3UploadFileMultipart(key, body, contentType, size ?? 0, PART_SIZE)
}

const SERVER_MULTIPART_CONCURRENCY = (() => {
  const v = Number(process.env.S3_SERVER_MULTIPART_CONCURRENCY)
  return Number.isFinite(v) && v >= 1 && v <= 16 ? Math.floor(v) : 4
})()

/** Upload a file using multipart upload. Internal helper for large files.
 *
 * For Buffer input: slices into part-sized chunks and uploads them in
 * parallel via a worker pool (was sequential — could be 4× slower on fast
 * links to MinIO).
 *
 * For Readable input: reads chunks of partSize off the stream and queues
 * them for parallel upload. We can't slice the stream up-front so we read
 * sequentially but upload concurrently — `inFlight` slots gate memory use.
 */
async function s3UploadFileMultipart(
  key: string,
  body: Readable | Buffer,
  contentType: string,
  totalSize: number,
  partSize: number = 25 * 1024 * 1024 // 25MB default (matches presign endpoint)
): Promise<void> {
  let uploadId: string | undefined
  const completedParts: CompletedPart[] = []

  async function uploadPart(partNumber: number, chunk: Buffer): Promise<void> {
    const res = await getS3Client().send(
      new UploadPartCommand({
        Bucket: getS3Bucket(),
        Key: key,
        UploadId: uploadId!,
        PartNumber: partNumber,
        Body: chunk,
      })
    )
    if (!res.ETag) throw new Error(`Missing ETag for part ${partNumber}`)
    completedParts.push({ ETag: res.ETag, PartNumber: partNumber })
  }

  try {
    uploadId = await s3InitiateMultipartUpload(key, contentType)

    if (Buffer.isBuffer(body)) {
      // Pre-known size — slice into part chunks and parallelise.
      const partCount = Math.ceil(body.length / partSize)
      let nextPart = 1
      const queue = Array.from({ length: partCount }, (_, i) => i + 1)

      const workers = Array.from(
        { length: Math.min(SERVER_MULTIPART_CONCURRENCY, partCount) },
        async () => {
          while (queue.length > 0) {
            const partNumber = queue.shift()!
            const offset = (partNumber - 1) * partSize
            const end = Math.min(offset + partSize, body.length)
            await uploadPart(partNumber, body.subarray(offset, end))
          }
        }
      )
      void nextPart
      await Promise.all(workers)
    } else {
      // Stream input — read part-sized chunks sequentially, then dispatch
      // each to one of N concurrent upload slots so we don't hold more than
      // SERVER_MULTIPART_CONCURRENCY parts in RAM at a time.
      let partNumber = 1
      const inFlight = new Set<Promise<void>>()
      let pending: Buffer[] = []
      let pendingSize = 0

      const flushPart = async () => {
        const partBody = pending.length === 1 ? pending[0] : Buffer.concat(pending, pendingSize)
        pending = []
        pendingSize = 0
        const myPart = partNumber++
        // Throttle: if we already have N parts in flight, wait for one.
        while (inFlight.size >= SERVER_MULTIPART_CONCURRENCY) {
          await Promise.race(inFlight)
        }
        const promise = uploadPart(myPart, partBody).finally(() => inFlight.delete(promise))
        inFlight.add(promise)
      }

      for await (const chunk of body) {
        const buf: Buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
        pending.push(buf)
        pendingSize += buf.length
        if (pendingSize >= partSize) {
          await flushPart()
        }
      }
      if (pendingSize > 0) {
        await flushPart()
      }
      await Promise.all(inFlight)
    }

    // CompleteMultipartUpload requires PartNumber-ordered parts.
    completedParts.sort((a, b) => (a.PartNumber ?? 0) - (b.PartNumber ?? 0))
    await s3CompleteMultipartUpload(key, uploadId, completedParts)
  } catch (err) {
    if (uploadId) {
      try { await s3AbortMultipartUpload(key, uploadId) } catch { /* swallow abort errors */ }
    }
    throw formatS3Error('PUT', key, err)
  }
}

/** Download an object as a readable stream — used by the worker. */
export async function s3DownloadFile(key: string): Promise<Readable> {
  let res
  try {
    res = await getS3Client().send(new GetObjectCommand({ Bucket: getS3Bucket(), Key: key }))
  } catch (err) {
    throw formatS3Error('GET', key, err)
  }
  if (!res.Body) throw new Error(`S3 object body missing for key: ${key}`)
  return res.Body as Readable
}

/** Delete a single object. */
export async function s3DeleteFile(key: string): Promise<void> {
  try {
    await getS3Client().send(new DeleteObjectCommand({ Bucket: getS3Bucket(), Key: key }))
  } catch (err) {
    throw formatS3Error('DELETE', key, err)
  }
}

/** Delete all objects under a key prefix (paginated). */
export async function s3DeleteDirectory(prefix: string): Promise<void> {
  const client = getS3Client()
  const bucket = getS3Bucket()
  const normalizedPrefix = prefix.endsWith('/') ? prefix : `${prefix}/`
  let continuationToken: string | undefined

  do {
    const res = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: normalizedPrefix, ContinuationToken: continuationToken })
    )
    const objects = res.Contents ?? []
    if (objects.length > 0) {
      await client.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: objects.map((o) => ({ Key: o.Key! })), Quiet: true },
        })
      )
    }
    continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined
  } while (continuationToken)
}

/** Return the byte size of an object via HeadObject. */
export async function s3GetFileSize(key: string): Promise<number> {
  const res = await getS3Client().send(new HeadObjectCommand({ Bucket: getS3Bucket(), Key: key }))
  if (res.ContentLength === undefined) {
    throw new Error(`S3 HeadObject returned no ContentLength for key: ${key}`)
  }
  return res.ContentLength
}

/** Return true if the object exists; false on 404; rethrows on any other error. */
export async function s3FileExists(key: string): Promise<boolean> {
  try {
    await getS3Client().send(new HeadObjectCommand({ Bucket: getS3Bucket(), Key: key }))
    return true
  } catch (err: unknown) {
    // HeadObject throws NotFound (not NoSuchKey) per AWS SDK v3 spec
    if (err instanceof NotFound) return false
    // Some S3-compatible providers (MinIO, R2) surface 404 via $metadata instead
    const e = err as { $metadata?: { httpStatusCode?: number }; message?: string }
    if (e?.$metadata?.httpStatusCode === 404) return false
    const status = e?.$metadata?.httpStatusCode
    throw new Error(`S3 HeadObject failed for key "${key}"${status ? ` (HTTP ${status})` : ''}: ${e?.message ?? String(err)}`)
  }
}

// ─── Multipart upload ────────────────────────────────────────────────────────

/** Start a multipart upload and return the UploadId. */
export async function s3InitiateMultipartUpload(
  key: string,
  contentType: string = 'application/octet-stream'
): Promise<string> {
  const res = await getS3Client().send(
    new CreateMultipartUploadCommand({ Bucket: getS3Bucket(), Key: key, ContentType: contentType })
  )
  if (!res.UploadId) throw new Error('Failed to initiate multipart upload')
  return res.UploadId
}

/** Return a presigned PUT URL for one part of a multipart upload. */
export async function s3GetPresignedPartUrl(
  key: string,
  uploadId: string,
  partNumber: number,
  expirySeconds: number = 3600
): Promise<string> {
  return getSignedUrl(
    getS3Client(),
    new UploadPartCommand({ Bucket: getS3Bucket(), Key: key, UploadId: uploadId, PartNumber: partNumber }),
    { expiresIn: expirySeconds }
  )
}

/** Assemble a completed multipart upload from its parts. */
export async function s3CompleteMultipartUpload(
  key: string,
  uploadId: string,
  parts: CompletedPart[]
): Promise<void> {
  await getS3Client().send(
    new CompleteMultipartUploadCommand({
      Bucket: getS3Bucket(),
      Key: key,
      UploadId: uploadId,
      MultipartUpload: { Parts: parts },
    })
  )
}

/** Abort an incomplete multipart upload to free storage. */
export async function s3AbortMultipartUpload(key: string, uploadId: string): Promise<void> {
  await getS3Client().send(
    new AbortMultipartUploadCommand({ Bucket: getS3Bucket(), Key: key, UploadId: uploadId })
  )
}

/** Abort all multipart uploads in the bucket that were initiated before cutoffDate. */
export async function s3AbortIncompleteMultipartUploadsOlderThan(cutoffDate: Date): Promise<number> {
  const client = getS3Client()
  const bucket = getS3Bucket()

  let abortedCount = 0
  let keyMarker: string | undefined
  let uploadIdMarker: string | undefined

  do {
    const listRes = await client.send(
      new ListMultipartUploadsCommand({
        Bucket: bucket,
        KeyMarker: keyMarker,
        UploadIdMarker: uploadIdMarker,
      })
    )

    const uploads = listRes.Uploads ?? []
    for (const upload of uploads) {
      if (!upload.Key || !upload.UploadId || !upload.Initiated) {
        continue
      }

      if (upload.Initiated.getTime() >= cutoffDate.getTime()) {
        continue
      }

      await client.send(
        new AbortMultipartUploadCommand({
          Bucket: bucket,
          Key: upload.Key,
          UploadId: upload.UploadId,
        })
      )
      abortedCount++
    }

    keyMarker = listRes.IsTruncated ? listRes.NextKeyMarker : undefined
    uploadIdMarker = listRes.IsTruncated ? listRes.NextUploadIdMarker : undefined
  } while (keyMarker)

  return abortedCount
}

// ─── Presigned GET URLs ───────────────────────────────────────────────────────

/** Presigned download URL. Adds Content-Disposition when filename is provided. */
export async function s3GetPresignedDownloadUrl(
  key: string,
  expirySeconds: number = 3600,
  filename?: string,
  contentType?: string
): Promise<string> {
  return getSignedUrl(
    getS3Client(),
    new GetObjectCommand({
      Bucket: getS3Bucket(),
      Key: key,
      ...(filename && {
        ResponseContentDisposition:
          `attachment; filename="${filename.replace(/["\\]/g, '')}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      }),
      ...(contentType && { ResponseContentType: contentType }),
    }),
    { expiresIn: expirySeconds }
  )
}

/** Presigned streaming URL (no Content-Disposition — browser plays inline). */
export async function s3GetPresignedStreamUrl(
  key: string,
  expirySeconds: number = 14400,
  contentType?: string
): Promise<string> {
  return getSignedUrl(
    getS3Client(),
    new GetObjectCommand({
      Bucket: getS3Bucket(),
      Key: key,
      ...(contentType && { ResponseContentType: contentType }),
    }),
    { expiresIn: expirySeconds }
  )
}
