import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AppLayout from '@/components/layout/AppLayout'

// Every conversation across all documents, most recent first
export default async function ConversationsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: conversations } = await supabase
    .from('conversations')
    .select('id, title, document_id, updated_at')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(200)

  const documentIds = Array.from(new Set((conversations ?? []).map(c => c.document_id)))
  const { data: documents } = documentIds.length
    ? await supabase.from('documents').select('id, filename').in('id', documentIds)
    : { data: [] }
  const filenames = new Map((documents ?? []).map(d => [d.id, d.filename]))

  return (
    <AppLayout>
      <div className="mb-8">
        <h2 className="text-2xl font-bold">Conversations</h2>
        <p className="text-gray-600">Your questions and answers across all documents</p>
      </div>

      {!conversations?.length ? (
        <div className="bg-white rounded-lg shadow p-6 text-sm text-gray-600">
          No conversations yet. Open a{' '}
          <Link href="/documents" className="text-indigo-600 hover:text-indigo-800">
            document
          </Link>{' '}
          and ask a question to start one.
        </div>
      ) : (
        <ul className="bg-white rounded-lg shadow divide-y">
          {conversations.map(conversation => (
            <li key={conversation.id}>
              <Link
                href={`/conversations/${conversation.id}`}
                className="flex items-center justify-between gap-4 px-6 py-4 hover:bg-gray-50"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-900">{conversation.title}</p>
                  <p className="truncate text-xs text-gray-500">{filenames.get(conversation.document_id) ?? 'Document'}</p>
                </div>
                <time dateTime={conversation.updated_at} className="shrink-0 text-xs text-gray-400">
                  {new Date(conversation.updated_at).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </time>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AppLayout>
  )
}
