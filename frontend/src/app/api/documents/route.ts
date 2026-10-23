import { createClient } from '@/lib/supabase/server'
import { log } from '@/lib/log'
import { NextResponse } from 'next/server'

// Per-user data read from the session cookie; never pre-render at build time
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: documents, error } = await supabase
      .from('documents')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      log.error('documents.list_failed', { error: error.message })
      return NextResponse.json({ error: 'Failed to fetch documents' }, { status: 500 })
    }

    return NextResponse.json(documents)
  } catch (error) {
    log.error('documents.list_failed', { error })
    return NextResponse.json({ error: 'Failed to fetch documents' }, { status: 500 })
  }
}
