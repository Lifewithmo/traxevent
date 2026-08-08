export const MAX_IMAGE_BYTES = 8 * 1024 * 1024

/**
 * Shared image-upload caps (proposal images and org brand assets). Error
 * messages are load-bearing: existing proposal-image tests assert them.
 */
export function assertImageUpload(file: unknown): File {
  if (!(file instanceof File)) throw new Error('No file provided')
  if (!file.type.startsWith('image/')) throw new Error('Only image uploads are allowed')
  if (file.size > MAX_IMAGE_BYTES) throw new Error('Image must be under 8MB')
  return file
}

export function safeUploadName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_')
}

/**
 * Firebase download-token URL for an uploaded object. Token-in-URL is the
 * access model (same unguessable-link trust as the proposal token itself):
 * prod org policy enforces uniform bucket-level access AND domain-restricted
 * sharing, so per-object makePublic()/allUsers IAM are both forbidden —
 * tokens are the Firebase-native way to serve public-by-link objects there.
 */
export function tokenizedDownloadUrl(bucketName: string, path: string, token: string): string {
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(path)}?alt=media&token=${token}`
}
