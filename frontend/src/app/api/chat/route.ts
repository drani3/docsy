import { createClient } from '@/lib/supabase/server'
import { answerQuestion } from '@/lib/rag/answer'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 60

const MAX_QUESTION_LENGTH = 2000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// POST /api/chat  { document_id, question } → { answer, found, citations }
// Conversation history (conversation_id) arrives in checkpoint 4;
// subscription and usage checks in checkpoint 6.
export async function POST(request: Request) {
  const startedAt = Date.now()
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    const documentId = typeof body?.document_id === 'string' ? body.document_id : ''
    const question = typeof body?.question === 'string' ? body.question.trim() : ''

    if (!UUID.test(documentId)) {
      return NextResponse.json({ error: 'Invalid document' }, { status: 400 })
    }
    if (!question) {
      return NextResponse.json({ error: 'Please enter a question' }, { status: 400 })
    }
    if (question.length > MAX_QUESTION_LENGTH) {
      return NextResponse.json({ error: `Questions can be at most ${MAX_QUESTION_LENGTH} characters` }, { status: 400 })
    }

    // Ownership: only the user's own documents are visible (also enforced by RLS)
    const { data: document } = await supabase
      .from('documents')
      .select('id, status')
      .eq('id', documentId)
      .eq('user_id', user.id)
      .single()

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }
    if (document.status !== 'ready') {
      return NextResponse.json({ error: 'This document is not ready for questions yet' }, { status: 409 })
    }

    const result = await answerQuestion({ supabase, userId: user.id, documentId, question })

    console.info('[chat] answered', {
      documentId,
      found: result.found,
      citations: result.citations.length,
      ...result.usage,
      ms: Date.now() - startedAt,
    })

    return NextResponse.json({ answer: result.answer, found: result.found, citations: result.citations })
  } catch (error: any) {
    console.error('[chat] failed', { ms: Date.now() - startedAt, error: error?.message })
    const timedOut = /timed out/i.test(error?.message ?? '')
    return NextResponse.json(
      { error: timedOut ? 'The answer took too long. Please try again.' : 'Failed to answer the question. Please try again.' },
      { status: timedOut ? 504 : 500 }
    )
  }
}
