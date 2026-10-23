import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AppLayout from '@/components/layout/AppLayout'
import ChatWorkspace from '@/components/chat/ChatWorkspace'
import DocumentNotReady from '@/components/chat/DocumentNotReady'
import { listDocumentConversations, loadMessagePage } from '@/lib/rag/conversation'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function ConversationPage({ params }: { params: { id: string } }) {
  if (!UUID.test(params.id)) notFound()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: conversation } = await supabase
    .from('conversations')
    .select('id, title, document_id')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!conversation) notFound()

  const { data: document } = await supabase
    .from('documents')
    .select('id, filename, file_size, page_count, status, error_message')
    .eq('id', conversation.document_id)
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

  const [conversations, { messages, hasMore }] = await Promise.all([
    listDocumentConversations(supabase, document.id),
    loadMessagePage(supabase, conversation.id),
  ])

  return (
    <AppLayout>
      {/* Keyed so switching conversations starts with fresh state */}
      <ChatWorkspace
        key={conversation.id}
        document={document}
        conversations={conversations}
        conversation={{ id: conversation.id, title: conversation.title }}
        initialMessages={messages}
        hasMore={hasMore}
      />
    </AppLayout>
  )
}
