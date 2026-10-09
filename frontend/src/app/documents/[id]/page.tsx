import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AppLayout from '@/components/layout/AppLayout'
import DocumentQA from '@/components/documents/DocumentQA'
import { formatFileSize } from '@/lib/uploads'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function DocumentPage({ params }: { params: { id: string } }) {
  if (!UUID.test(params.id)) notFound()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: document } = await supabase
    .from('documents')
    .select('id, filename, file_size, page_count, status, error_message')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .single()

  if (!document) notFound()

  return (
    <AppLayout>
      <div className="max-w-3xl">
        <Link href="/documents" className="text-sm text-indigo-600 hover:text-indigo-800">
          ← All documents
        </Link>
        <div className="mt-2 mb-6">
          <h2 className="text-2xl font-bold break-words">{document.filename}</h2>
          <p className="text-sm text-gray-500">
            {formatFileSize(document.file_size)}
            {document.page_count ? ` · ${document.page_count} pages` : ''}
          </p>
        </div>

        {document.status === 'ready' ? (
          <DocumentQA documentId={document.id} />
        ) : (
          <div className="bg-white rounded-lg shadow p-6 text-sm text-gray-700">
            {document.status === 'failed' ? (
              <>
                <p className="font-medium text-red-700">This document could not be processed.</p>
                {document.error_message && <p className="mt-1">{document.error_message}</p>}
                <p className="mt-2">Retry it from the documents page.</p>
              </>
            ) : (
              <p>
                This document is still being prepared (<span className="capitalize">{document.status}</span>). You can
                ask questions once it&apos;s ready.
              </p>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
