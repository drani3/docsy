import { createClient } from '@/lib/supabase/server'
import { loadMessagePage } from '@/lib/rag/conversation'
import { rateLimit } from '@/lib/rate-limit'
import { log } from '@/lib/log'
import { NextResponse } from 'next/server'

// GET /api/conversations/:id/messages?before=<ISO timestamp> → { messages, hasMore }
// Pages backwards through history; the newest page is rendered with the page.
export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const limited = await rateLimit('default', user.id)
    if (limited) return limited

    const before = new URL(request.url).searchParams.get('before') ?? undefined
    if (before && Number.isNaN(Date.parse(before))) {
      return NextResponse.json({ error: 'Invalid cursor' }, { status: 400 })
    }

    const { data: conversation } = await supabase
      .from('conversations')
      .select('id')
      .eq('id', params.id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    return NextResponse.json(await loadMessagePage(supabase, conversation.id, before))
  } catch (error) {
    log.error('conversation.messages_failed', { conversation_id: params.id, error })
    return NextResponse.json({ error: 'Failed to load messages' }, { status: 500 })
  }
}
