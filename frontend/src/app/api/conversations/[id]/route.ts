import { createClient } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rate-limit'
import { log } from '@/lib/log'
import { NextResponse } from 'next/server'

const MAX_TITLE_LENGTH = 200

// PATCH /api/conversations/:id  { title } — rename
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const limited = await rateLimit('default', user.id)
    if (limited) return limited

    const body = await request.json().catch(() => null)
    const title = typeof body?.title === 'string' ? body.title.replace(/\s+/g, ' ').trim() : ''
    if (!title || title.length > MAX_TITLE_LENGTH) {
      return NextResponse.json({ error: `Titles must be 1–${MAX_TITLE_LENGTH} characters` }, { status: 400 })
    }

    // RLS and column grants limit this to the title of the user's own conversations
    const { data, error } = await supabase
      .from('conversations')
      .update({ title })
      .eq('id', params.id)
      .eq('user_id', user.id)
      .select('id, title')
      .maybeSingle()

    if (error) {
      log.error('conversation.rename_failed', { conversation_id: params.id, error })
      return NextResponse.json({ error: 'Failed to rename conversation' }, { status: 500 })
    }
    if (!data) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    return NextResponse.json(data)
  } catch (error) {
    log.error('conversation.rename_failed', { conversation_id: params.id, error })
    return NextResponse.json({ error: 'Failed to rename conversation' }, { status: 500 })
  }
}

// DELETE /api/conversations/:id — messages go with it (on delete cascade)
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const limited = await rateLimit('default', user.id)
    if (limited) return limited

    const { data, error } = await supabase
      .from('conversations')
      .delete()
      .eq('id', params.id)
      .eq('user_id', user.id)
      .select('id')

    if (error) {
      log.error('conversation.delete_failed', { conversation_id: params.id, error })
      return NextResponse.json({ error: 'Failed to delete conversation' }, { status: 500 })
    }
    if (!data?.length) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    log.error('conversation.delete_failed', { conversation_id: params.id, error })
    return NextResponse.json({ error: 'Failed to delete conversation' }, { status: 500 })
  }
}
