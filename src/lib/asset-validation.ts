export const ALLOWED_ASSET_EXTENSIONS = {
  thumbnail: ['.jpg', '.jpeg', '.png'],
  image: ['.jpg', '.jpeg', '.png', '.tif', '.tiff', '.psd', '.ai', '.eps'],
  audio: ['.wav', '.mp3', '.aac', '.flac', '.m4a'],
  project: ['.prproj', '.drp', '.fcpbundle', '.fcpxml'],
  document: ['.pdf', '.txt', '.md', '.doc', '.docx'],
  archive: ['.zip']
} as const

export const ALL_ALLOWED_EXTENSIONS = [
  ...ALLOWED_ASSET_EXTENSIONS.thumbnail,
  ...ALLOWED_ASSET_EXTENSIONS.image,
  ...ALLOWED_ASSET_EXTENSIONS.audio,
  ...ALLOWED_ASSET_EXTENSIONS.project,
  ...ALLOWED_ASSET_EXTENSIONS.document,
  ...ALLOWED_ASSET_EXTENSIONS.archive
] as string[]

export function validateAssetExtension(
  filename: string,
  category?: string
): { valid: boolean; error?: string } {
  const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'))

  if (!ALL_ALLOWED_EXTENSIONS.includes(ext)) {
    return {
      valid: false,
      error: `File type "${ext}" is not allowed. Allowed types: ${ALL_ALLOWED_EXTENSIONS.join(', ')}`
    }
  }

  if (category === 'thumbnail' && !ALLOWED_ASSET_EXTENSIONS.thumbnail.includes(ext as any)) {
    return {
      valid: false,
      error: `Thumbnails must be JPG or PNG format. Selected: ${ext}`
    }
  }

  return { valid: true }
}

export function detectAssetCategory(filename: string): string {
  const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'))

  if (ALLOWED_ASSET_EXTENSIONS.audio.includes(ext as any)) return 'audio'
  if (ALLOWED_ASSET_EXTENSIONS.project.includes(ext as any)) return 'project'
  if (ALLOWED_ASSET_EXTENSIONS.document.includes(ext as any)) return 'document'
  if (ALLOWED_ASSET_EXTENSIONS.archive.includes(ext as any)) return ''
  if (ALLOWED_ASSET_EXTENSIONS.image.includes(ext as any)) return 'image'

  return ''
}
