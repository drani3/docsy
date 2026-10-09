import { createClient } from '@/lib/supabase/server'
import { ingestDocument } from '@/lib/ingestion'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
// Vercel Hobby allows up to 60s; ingestion of a 10MB PDF fits comfortably
export const maxDuration = 60

// Starts (or retries) ingestion for a document the caller owns.
// ?force=1 re-processes a document that is already ready (e.g. after the
// chunking or embedding settings change).
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: document } = await supabase
      .from('documents')
      .select('id, status')
      .eq('id', params.id)
      .eq('user_id', user.id)
      .single()

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    if (document.status === 'uploading') {
      return NextResponse.json({ error: 'Document upload has not completed' }, { status: 409 })
    }

    const force = new URL(request.url).searchParams.get('force') === '1'
    if (document.status === 'ready' && !force) {
      return NextResponse.json({ id: document.id, status: 'ready' })
    }

    const result = await ingestDocument(document.id)

    return NextResponse.json({ id: document.id, ...result })
  } catch (error) {
    console.error('Error processing document:', error)
    return NextResponse.json({ error: 'Failed to process document' }, { status: 500 })
  }
}
