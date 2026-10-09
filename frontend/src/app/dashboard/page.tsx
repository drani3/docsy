import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AppLayout from '@/components/layout/AppLayout'

const STATUS_STYLES: Record<string, string> = {
  uploading: 'bg-gray-100 text-gray-700',
  processing: 'bg-yellow-100 text-yellow-800',
  embedding: 'bg-blue-100 text-blue-800',
  ready: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: documents } = await supabase
    .from('documents')
    .select('id, filename, status, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  const docs = documents ?? []
  const counts = {
    total: docs.length,
    ready: docs.filter(d => d.status === 'ready').length,
    inProgress: docs.filter(d => ['uploading', 'processing', 'embedding'].includes(d.status)).length,
    failed: docs.filter(d => d.status === 'failed').length,
  }

  return (
    <AppLayout>
      <div className="mb-8">
        <h2 className="text-2xl font-bold">Dashboard</h2>
        <p className="text-gray-600">Manage your documents</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Documents', value: counts.total },
          { label: 'Ready', value: counts.ready },
          { label: 'Processing', value: counts.inProgress },
          { label: 'Failed', value: counts.failed },
        ].map(stat => (
          <div key={stat.label} className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-500">{stat.label}</p>
            <p className="text-2xl font-semibold text-gray-900">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-medium text-gray-900">Recent documents</h3>
          <Link href="/documents" className="text-sm text-indigo-600 hover:text-indigo-800">
            {docs.length ? 'View all' : 'Upload a PDF'}
          </Link>
        </div>
        {docs.length === 0 ? (
          <p className="p-6 text-gray-500">No documents yet. Upload a PDF to get started.</p>
        ) : (
          <ul className="divide-y">
            {docs.slice(0, 5).map(doc => (
              <li key={doc.id} className="flex items-center justify-between gap-4 p-4">
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
                  <p className="text-xs text-gray-500">{new Date(doc.created_at).toLocaleString()}</p>
                </div>
                <span
                  className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${STATUS_STYLES[doc.status]}`}
                >
                  {doc.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppLayout>
  )
}
