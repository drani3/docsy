import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AppLayout from '@/components/layout/AppLayout'
import ChatWorkspace from '@/components/chat/ChatWorkspace'
import DocumentNotReady from '@/components/chat/DocumentNotReady'
import { listDocumentConversations } from '@/lib/rag/conversation'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// A document with a new, empty conversation
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

  if (document.status !== 'ready') {
    return (
      <AppLayout>
        <DocumentNotReady document={document} />
      </AppLayout>
    )
  }

  const conversations = await listDocumentConversations(supabase, document.id)

  return (
    <AppLayout>
      <ChatWorkspace
        key="new"
        document={document}
        conversations={conversations}
        conversation={null}
        initialMessages={[]}
        hasMore={false}
      />
    </AppLayout>
  )
}
