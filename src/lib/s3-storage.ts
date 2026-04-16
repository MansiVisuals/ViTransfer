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
 * For files >= 100MB, uses multipart upload to avoid request size limits.
 * Aligns with presign endpoint which uses 25MB default chunks.
 */
export async function s3UploadFile(
  key: string,
  body: Readable | Buffer,
  contentType: string = 'application/octet-stream',
  size?: number
): Promise<void> {
  // Use multipart upload for files >= 100MB
  const MULTIPART_THRESHOLD = 100 * 1024 * 1024 // 100MB
  const PART_SIZE = 25 * 1024 * 1024 // 25MB per part (matches presign endpoint)

  // If size is provided and exceeds threshold, use multipart
  if (size !== undefined && size >= MULTIPART_THRESHOLD) {
    return s3UploadFileMultipart(key, body, contentType, size, PART_SIZE)
  }

  // For unknown size streams, detect by reading first chunk
  if (size === undefined && body instanceof Readable) {
    // Peek at stream to detect if it's large enough for multipart
    const chunks: Buffer[] = []
    let totalSize = 0
    let readable = body
    const PART_SIZE = 25 * 1024 * 1024 // 25MB per part (matches presign endpoint)

    // Try to determine size from stream before committing to single PUT
    return new Promise((resolve, reject) => {
      let uploadedUsingMultipart = false

      readable.on('data', async (chunk: Buffer) => {
        chunks.push(chunk)
        totalSize += chunk.length

        // Switch to multipart mid-stream if size exceeds threshold
        if (!uploadedUsingMultipart && totalSize >= MULTIPART_THRESHOLD) {
          uploadedUsingMultipart = true
          readable.pause()

          try {
            const bufferBody = Buffer.concat(chunks)
            const uploadStream = Readable.from([bufferBody, readable])
            await s3UploadFileMultipart(key, uploadStream, contentType, totalSize, PART_SIZE)
            resolve()
          } catch (err) {
            reject(formatS3Error('PUT', key, err))
          }
        }
      })

      readable.on('end', async () => {
        if (!uploadedUsingMultipart) {
          try {
            const bufferBody = Buffer.concat(chunks)
            await getS3Client().send(
              new PutObjectCommand({ Bucket: getS3Bucket(), Key: key, Body: bufferBody, ContentType: contentType })
            )
            resolve()
          } catch (err) {
            reject(formatS3Error('PUT', key, err))
          }
        }
      })

      readable.on('error', (err) => {
        reject(formatS3Error('PUT', key, err))
      })
    })
  }

  // Buffer or sized stream under threshold: use single PUT
  try {
    await getS3Client().send(
      new PutObjectCommand({ Bucket: getS3Bucket(), Key: key, Body: body, ContentType: contentType })
    )
  } catch (err) {
    throw formatS3Error('PUT', key, err)
  }
}

/** Upload a file using multipart upload. Internal helper for large files. */
async function s3UploadFileMultipart(
  key: string,
  body: Readable | Buffer,
  contentType: string,
  totalSize: number,
  partSize: number = 25 * 1024 * 1024 // 25MB default (matches presign endpoint)
): Promise<void> {
  let uploadId: string | undefined

  try {
    // Initiate multipart upload - reuse existing exported function
    uploadId = await s3InitiateMultipartUpload(key, contentType)

    const parts: CompletedPart[] = []
    const bodyBuffer = Buffer.isBuffer(body) ? body : await streamToBuffer(body)

    // Upload parts
    let offset = 0
    let partNumber = 1
    while (offset < bodyBuffer.length) {
      const end = Math.min(offset + partSize, bodyBuffer.length)
      const chunk = bodyBuffer.subarray(offset, end)

      const uploadRes = await getS3Client().send(
        new UploadPartCommand({
          Bucket: getS3Bucket(),
          Key: key,
          UploadId: uploadId,
          PartNumber: partNumber,
          Body: chunk,
        })
      )

      if (!uploadRes.ETag) throw new Error(`Missing ETag for part ${partNumber}`)
      parts.push({ ETag: uploadRes.ETag, PartNumber: partNumber })

      offset = end
      partNumber++
    }

    // Complete multipart upload - reuse existing exported function
    await s3CompleteMultipartUpload(key, uploadId, parts)
  } catch (err) {
    // Abort multipart upload on error to free storage - reuse existing exported function
    if (uploadId) {
      try {
        await s3AbortMultipartUpload(key, uploadId)
      } catch {
        // Ignore abort errors
      }
    }
    throw formatS3Error('PUT', key, err)
  }
}

/** Convert a readable stream to a buffer. */
async function streamToBuffer(stream: Readable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    stream.on('data', (chunk) => chunks.push(chunk))
    stream.on('end', () => resolve(Buffer.concat(chunks)))
    stream.on('error', reject)
  })
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
