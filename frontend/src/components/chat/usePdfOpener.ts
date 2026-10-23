'use client'

import { useCallback, useRef } from 'react'
import { showToast } from '@/components/ui/Toast'
import { apiFetch } from '@/lib/api-client'

// Signed URLs are valid for 5 minutes; reuse one for a little less than that
const URL_REUSE_MS = 4 * 60 * 1000

// Opens the document's PDF at a page in a new tab. The tab is opened
// synchronously (so it isn't treated as a pop-up), then pointed at the signed
// URL once we have it.
export function usePdfOpener(documentId: string) {
  const viewUrl = useRef<{ url: string; at: number } | null>(null)

  return useCallback(
    async (page: number) => {
      const tab = window.open('', '_blank')
      try {
        let url = viewUrl.current && Date.now() - viewUrl.current.at < URL_REUSE_MS ? viewUrl.current.url : null
        if (!url) {
          const response = await apiFetch(`/api/documents/${documentId}/download?inline=1`)
          const body = await response.json().catch(() => null)
          if (!response.ok) throw new Error(body?.error || 'Failed to open document')
          url = body.url as string
          viewUrl.current = { url, at: Date.now() }
        }
        const target = `${url}#page=${page}`
        if (tab) tab.location.href = target
        else window.location.href = target
      } catch (error: any) {
        tab?.close()
        showToast('error', error.message || 'Failed to open document')
      }
    },
    [documentId]
  )
}
