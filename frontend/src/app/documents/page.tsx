'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import AppLayout from '@/components/layout/AppLayout'
import Empty from '@/components/ui/Empty'
import ErrorState from '@/components/ui/Error'
import Loading from '@/components/ui/Loading'
import { showToast } from '@/components/ui/Toast'
import { formatFileSize, validateUpload } from '@/lib/uploads'

interface DocumentRow {
  id: string
  filename: string
  file_size: number
  status: 'uploading' | 'processing' | 'embedding' | 'ready' | 'failed'
  page_count: number | null
  error_message: string | null
  created_at: string
  updated_at: string
}

const STATUS_STYLES: Record<DocumentRow['status'], string> = {
  uploading: 'bg-gray-100 text-gray-700',
  processing: 'bg-yellow-100 text-yellow-800',
  embedding: 'bg-blue-100 text-blue-800',
  ready: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
}

const IN_PROGRESS: DocumentRow['status'][] = ['processing', 'embedding']
const POLL_INTERVAL_MS = 3000
// A document stuck in progress this long (e.g. the tab closed mid-processing) can be retried
const STUCK_AFTER_MS = 2 * 60 * 1000

async function readError(response: Response, fallback: string) {
  const body = await response.json().catch(() => null)
  return body?.error || fallback
}

// fetch() can't report upload progress, so the R2 PUT uses XHR
function putWithProgress(url: string, file: File, onProgress: (percent: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    xhr.setRequestHeader('Content-Type', file.type)
    xhr.upload.onprogress = e => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error('Failed to upload file to storage'))
    xhr.onerror = () => reject(new Error('Failed to upload file to storage'))
    xhr.send(file)
  })
}

function isStuck(doc: DocumentRow) {
  return IN_PROGRESS.includes(doc.status) && Date.now() - new Date(doc.updated_at).getTime() > STUCK_AFTER_MS
}

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<DocumentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const [dragging, setDragging] = useState(false)
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set())

  const uploading = uploadProgress !== null

  const setBusy = (id: string, busy: boolean) =>
    setBusyIds(prev => {
      const next = new Set(prev)
      if (busy) next.add(id)
      else next.delete(id)
      return next
    })

  const loadDocuments = useCallback(async () => {
    try {
      const response = await fetch('/api/documents')
      if (!response.ok) {
        throw new Error(await readError(response, 'Failed to load documents'))
      }
      setDocuments(await response.json())
      setLoadError(null)
    } catch (error: any) {
      setLoadError(error.message || 'Failed to load documents')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadDocuments()
  }, [loadDocuments])

  // Keep statuses live while anything is processing
  const hasInProgress = documents.some(d => IN_PROGRESS.includes(d.status))
  useEffect(() => {
    if (!hasInProgress) return
    const timer = setInterval(loadDocuments, POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [hasInProgress, loadDocuments])

  const processDocument = useCallback(
    async (id: string, filename: string, force = false) => {
      setBusy(id, true)
      if (force) {
        // Show progress immediately; the server sets the real status as it goes
        setDocuments(docs => docs.map(d => (d.id === id ? { ...d, status: 'processing', updated_at: new Date().toISOString() } : d)))
      }
      try {
        const response = await fetch(`/api/documents/${id}/process${force ? '?force=1' : ''}`, { method: 'POST' })
        if (!response.ok) {
          throw new Error(await readError(response, 'Failed to process document'))
        }
        const result = await response.json()
        if (result.status === 'ready') {
          showToast('success', `"${filename}" is ready`)
        } else if (result.status === 'failed') {
          showToast('error', result.error || `"${filename}" could not be processed`)
        }
      } catch (error: any) {
        showToast('error', error.message || 'Failed to process document')
      } finally {
        setBusy(id, false)
        loadDocuments()
      }
    },
    [loadDocuments]
  )

  const selectFile = (selectedFile: File | undefined) => {
    if (!selectedFile || uploading) return
    const validationError = validateUpload(selectedFile)
    if (validationError) {
      showToast('error', validationError)
      return
    }
    setFile(selectedFile)
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    selectFile(e.target.files?.[0])
    e.target.value = ''
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    if (e.dataTransfer.files.length > 1) {
      showToast('info', 'Only one file can be uploaded at a time')
    }
    selectFile(e.dataTransfer.files[0])
  }

  const handleUpload = async () => {
    if (!file) return

    setUploadProgress(0)
    let documentId: string | null = null

    try {
      // 1. Create the document record and get a presigned upload URL
      const startResponse = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name, fileSize: file.size, mimeType: file.type }),
      })
      if (!startResponse.ok) {
        throw new Error(await readError(startResponse, 'Failed to start upload'))
      }
      const { documentId: id, uploadUrl } = await startResponse.json()
      documentId = id

      // 2. Upload the file directly to R2
      await putWithProgress(uploadUrl, file, setUploadProgress)

      // 3. Tell the server the upload finished
      const completeResponse = await fetch(`/api/documents/${id}/complete`, { method: 'POST' })
      if (!completeResponse.ok) {
        throw new Error(await readError(completeResponse, 'Failed to complete upload'))
      }

      showToast('success', 'Uploaded. Processing your document...')
      const filename = file.name
      setFile(null)
      setUploadProgress(null)
      await loadDocuments()

      // 4. Start ingestion; the list polls for status while it runs
      processDocument(id, filename)
    } catch (error: any) {
      console.error('Upload error:', error)
      showToast('error', error.message || 'Failed to upload document')
      // Clean up the half-created record so it doesn't sit in "uploading" forever
      if (documentId) {
        await fetch(`/api/documents/${documentId}`, { method: 'DELETE' }).catch(() => {})
      }
      setUploadProgress(null)
      loadDocuments()
    }
  }

  const handleDownload = async (doc: DocumentRow) => {
    setBusy(doc.id, true)
    try {
      const response = await fetch(`/api/documents/${doc.id}/download`)
      if (!response.ok) {
        throw new Error(await readError(response, 'Failed to download document'))
      }
      const { url } = await response.json()
      window.location.href = url
    } catch (error: any) {
      showToast('error', error.message || 'Failed to download document')
    } finally {
      setBusy(doc.id, false)
    }
  }

  const handleDelete = async (doc: DocumentRow) => {
    if (!window.confirm(`Delete "${doc.filename}"? This cannot be undone.`)) return

    setBusy(doc.id, true)
    try {
      const response = await fetch(`/api/documents/${doc.id}`, { method: 'DELETE' })
      if (!response.ok) {
        throw new Error(await readError(response, 'Failed to delete document'))
      }
      setDocuments(docs => docs.filter(d => d.id !== doc.id))
      showToast('success', 'Document deleted')
    } catch (error: any) {
      showToast('error', error.message || 'Failed to delete document')
    } finally {
      setBusy(doc.id, false)
    }
  }

  return (
    <AppLayout>
      <div className="mb-8">
        <h2 className="text-2xl font-bold">Documents</h2>
        <p className="text-gray-600">Upload and manage your PDF documents</p>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <div
          onDragOver={e => {
            e.preventDefault()
            if (!uploading) setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
            dragging ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300'
          }`}
        >
          <input
            type="file"
            accept="application/pdf,.pdf"
            onChange={handleFileInput}
            className="hidden"
            id="file-upload"
            disabled={uploading}
          />
          <label htmlFor="file-upload" className={uploading ? 'cursor-default' : 'cursor-pointer'}>
            <div className="text-gray-400 mb-4">
              <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <p className="text-sm text-gray-600 mb-2">
              {file ? `${file.name} (${formatFileSize(file.size)})` : 'Drag and drop a PDF here, or click to choose'}
            </p>
            <p className="text-xs text-gray-500">PDF files up to 10MB</p>
          </label>

          {uploading ? (
            <div className="mt-4 max-w-sm mx-auto">
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-600 transition-all"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-gray-600">Uploading... {uploadProgress}%</p>
            </div>
          ) : (
            file && (
              <div className="mt-4 flex justify-center gap-3">
                <button
                  onClick={handleUpload}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700"
                >
                  Upload
                </button>
                <button
                  onClick={() => setFile(null)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            )
          )}
        </div>
      </div>

      <div className="mt-8">
        {loading ? (
          <Loading message="Loading documents..." />
        ) : loadError ? (
          <ErrorState message={loadError} onRetry={loadDocuments} />
        ) : documents.length === 0 ? (
          <Empty
            title="No documents yet"
            description="Upload a PDF document to get started with AI-powered analysis"
          />
        ) : (
          <div className="bg-white rounded-lg shadow divide-y">
            {documents.map(doc => {
              const busy = busyIds.has(doc.id)
              const canRetry = !busy && (doc.status === 'failed' || isStuck(doc))
              return (
                <div key={doc.id} className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="min-w-0">
                      {doc.status === 'ready' ? (
                        <Link
                          href={`/documents/${doc.id}`}
                          className="block font-medium text-indigo-700 hover:text-indigo-900 truncate"
                        >
                          {doc.filename}
                        </Link>
                      ) : (
                        <p className="font-medium text-gray-900 truncate">{doc.filename}</p>
                      )}
                      <p className="text-xs text-gray-500">
                        {formatFileSize(doc.file_size)}
                        {doc.page_count ? ` · ${doc.page_count} pages` : ''}
                        {' · '}
                        {new Date(doc.created_at).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium capitalize ${STATUS_STYLES[doc.status]}`}
                      >
                        {IN_PROGRESS.includes(doc.status) && (
                          <span className="w-2 h-2 rounded-full bg-current animate-pulse" />
                        )}
                        {doc.status}
                      </span>
                      {canRetry && (
                        <button
                          onClick={() => processDocument(doc.id, doc.filename)}
                          className="text-sm text-indigo-600 hover:text-indigo-800"
                        >
                          Retry
                        </button>
                      )}
                      {doc.status === 'ready' && (
                        <button
                          onClick={() => processDocument(doc.id, doc.filename, true)}
                          disabled={busy}
                          title="Extract, chunk and index this document again"
                          className="text-sm text-gray-600 hover:text-gray-900 disabled:opacity-50"
                        >
                          Reprocess
                        </button>
                      )}
                      <button
                        onClick={() => handleDownload(doc)}
                        disabled={busy || doc.status === 'uploading'}
                        className="text-sm text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
                      >
                        Download
                      </button>
                      <button
                        onClick={() => handleDelete(doc)}
                        disabled={busy}
                        className="text-sm text-red-600 hover:text-red-800 disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  {doc.status === 'failed' && doc.error_message && (
                    <p className="mt-2 text-sm text-red-700">{doc.error_message}</p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
