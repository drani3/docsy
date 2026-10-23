// Upload limits shared by the browser and the API routes.
// Keep this file free of server-only imports so client components can use it.

import { PLAN_LIMITS } from '@/lib/billing/plans'

// Default (Free plan) limit; the user's actual limit comes from their plan
export const MAX_FILE_SIZE = PLAN_LIMITS.free.maxFileSize
// Largest file any plan accepts
export const ABSOLUTE_MAX_FILE_SIZE = Math.max(...Object.values(PLAN_LIMITS).map(l => l.maxFileSize))
export const ALLOWED_MIME_TYPES = ['application/pdf']

export function validateUpload(file: { name: string; size: number; type: string }, maxSize = MAX_FILE_SIZE): string | null {
  if (!ALLOWED_MIME_TYPES.includes(file.type) || !file.name.toLowerCase().endsWith('.pdf')) {
    return 'Only PDF files are allowed'
  }
  if (file.size <= 0) {
    return 'File is empty'
  }
  if (file.size > maxSize) {
    return `File size exceeds ${formatFileSize(maxSize)} limit`
  }
  return null
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  const mb = bytes / (1024 * 1024)
  return `${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB`
}
