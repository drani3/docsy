'use client'

import { useCallback, useEffect, useState } from 'react'
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
  created_at: string
}

const STATUS_STYLES: Record<DocumentRow['status'], string> = {
  uploading: 'bg-gray-100 text-gray-700',
  processing: 'bg-yellow-100 text-yellow-800',
  embedding: 'bg-blue-100 text-blue-800',
  ready: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
}

async function readError(response: Response, fallback: string) {
  const body = await response.json().catch(() => null)
  return body?.error || fallback
}

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<DocumentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

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

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    e.target.value = ''
    if (!selectedFile) return

    const validationError = validateUpload(selectedFile)
    if (validationError) {
      showToast('error', validationError)
      return
    }
    setFile(selectedFile)
  }

  const handleUpload = async () => {
    if (!file) return

    setUploading(true)
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
      const putResponse = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      })
      if (!putResponse.ok) {
        throw new Error('Failed to upload file to storage')
      }

      // 3. Tell the server the upload finished
      const completeResponse = await fetch(`/api/documents/${id}/complete`, { method: 'POST' })
      if (!completeResponse.ok) {
        throw new Error(await readError(completeResponse, 'Failed to complete upload'))
      }

      showToast('success', 'Document uploaded successfully')
      setFile(null)
    } catch (error: any) {
      console.error('Upload error:', error)
      showToast('error', error.message || 'Failed to upload document')
      // Clean up the half-created record so it doesn't sit in "uploading" forever
      if (documentId) {
        await fetch(`/api/documents/${documentId}`, { method: 'DELETE' }).catch(() => {})
      }
    } finally {
      setUploading(false)
      loadDocuments()
    }
  }

  const handleDownload = async (doc: DocumentRow) => {
    setBusyId(doc.id)
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
      setBusyId(null)
    }
  }

  const handleDelete = async (doc: DocumentRow) => {
    if (!window.confirm(`Delete "${doc.filename}"? This cannot be undone.`)) return

    setBusyId(doc.id)
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
      setBusyId(null)
    }
  }

  return (
    <AppLayout>
      <div className="mb-8">
        <h2 className="text-2xl font-bold">Documents</h2>
        <p className="text-gray-600">Upload and manage your PDF documents</p>
      </div>

      {uploading ? (
        <Loading message="Uploading document..." />
      ) : (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
            <input
              type="file"
              accept="application/pdf,.pdf"
              onChange={handleFileSelect}
              className="hidden"
              id="file-upload"
              disabled={uploading}
            />
            <label htmlFor="file-upload" className="cursor-pointer">
              <div className="text-gray-400 mb-4">
                <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <p className="text-sm text-gray-600 mb-2">
                {file ? `${file.name} (${formatFileSize(file.size)})` : 'Click to choose a PDF'}
              </p>
              <p className="text-xs text-gray-500">PDF files up to 10MB</p>
            </label>

            {file && (
              <button
                onClick={handleUpload}
                disabled={uploading}
                className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50"
              >
                Upload
              </button>
            )}
          </div>
        </div>
      )}

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
            {documents.map(doc => (
              <div key={doc.id} className="flex flex-wrap items-center justify-between gap-4 p-4">
                <div className="min-w-0">
                  <p className="font-medium text-gray-900 truncate">{doc.filename}</p>
                  <p className="text-xs text-gray-500">
                    {formatFileSize(doc.file_size)} · {new Date(doc.created_at).toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${STATUS_STYLES[doc.status]}`}>
                    {doc.status}
                  </span>
                  <button
                    onClick={() => handleDownload(doc)}
                    disabled={busyId === doc.id || doc.status === 'uploading'}
                    className="text-sm text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
                  >
                    Download
                  </button>
                  <button
                    onClick={() => handleDelete(doc)}
                    disabled={busyId === doc.id}
                    className="text-sm text-red-600 hover:text-red-800 disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
