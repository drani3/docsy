// Upload limits shared by the browser and the API routes.
// Keep this file free of server-only imports so client components can use it.

export const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
export const ALLOWED_MIME_TYPES = ['application/pdf']

export function validateUpload(file: { name: string; size: number; type: string }): string | null {
  if (!ALLOWED_MIME_TYPES.includes(file.type) || !file.name.toLowerCase().endsWith('.pdf')) {
    return 'Only PDF files are allowed'
  }
  if (file.size <= 0) {
    return 'File is empty'
  }
  if (file.size > MAX_FILE_SIZE) {
    return 'File size exceeds 10MB limit'
  }
  return null
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
