import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { chatStream } from '@/lib/ai/openai'
import {
  MAX_ANSWER_TOKENS,
  NOT_FOUND_ANSWER,
  buildMessages,
  finalizeAnswer,
  retrieveSources,
  toCitation,
} from '@/lib/rag/answer'
import {
  EMPTY_CONTEXT,
  assistantMetadata,
  fallbackTitle,
  generateTitle,
  loadContext,
  maybeSummarize,
  toChatMessage,
} from '@/lib/rag/conversation'
import { checkEntitlement, recordTokens, refundQuestion } from '@/lib/billing/entitlements'
import { rateLimit } from '@/lib/rate-limit'
import { log, timer } from '@/lib/log'
import type { ChatEvent } from '@/lib/chat/types'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 60

const MAX_QUESTION_LENGTH = 2000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// POST /api/chat  { document_id, conversation_id, question } → NDJSON stream of ChatEvent
//
// Request → authentication → rate limit → document ownership → entitlement
// (counts the question against the monthly limit) → retrieval → streamed answer.
//
// The client picks the id of a new conversation, so it knows it even if the
// user presses Stop before the answer finishes. The conversation row and the
// question/answer pair are written only once there is an answer: a failed
// request leaves nothing behind, isn't counted against the limit, and can
// simply be retried.
export async function POST(request: Request) {
  const startedAt = new Date()
  const elapsed = timer()
  let userId: string | null = null
  let questionCounted = false

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    userId = user.id

    const limited = await rateLimit('chat', user.id)
    if (limited) return limited

    const body = await request.json().catch(() => null)
    const documentId = typeof body?.document_id === 'string' ? body.document_id : ''
    const conversationId = typeof body?.conversation_id === 'string' ? body.conversation_id : ''
    const question = typeof body?.question === 'string' ? body.question.trim() : ''

    if (!UUID.test(documentId) || !UUID.test(conversationId)) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
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

    // An unknown id means a new conversation. An id that belongs to someone
    // else is invisible here (RLS) and fails on insert as a duplicate.
    const { data: conversation } = await supabase
      .from('conversations')
      .select('id, document_id, title, summary, summary_message_count')
      .eq('id', conversationId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (conversation && conversation.document_id !== documentId) {
      return NextResponse.json({ error: 'This conversation belongs to another document' }, { status: 400 })
    }

    const entitlement = await checkEntitlement(user.id, 'ask_question')
    if (!entitlement.allowed) {
      return NextResponse.json({ error: entitlement.reason, upgrade: entitlement.upgrade }, { status: 403 })
    }
    questionCounted = true

    const context = conversation ? await loadContext(supabase, conversation) : EMPTY_CONTEXT
    const retrievalTimer = timer()
    const { sources, embeddingTokens } = await retrieveSources({
      supabase,
      userId: user.id,
      documentId,
      question,
      previousQuestion: context.previousQuestion,
    })
    const retrievalMs = retrievalTimer()

    const abort = new AbortController()
    request.signal.addEventListener('abort', () => abort.abort(), { once: true })

    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: ChatEvent) => {
          if (abort.signal.aborted) return
          try {
            controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
          } catch {
            // Client went away
          }
        }

        const usage = { embeddingTokens, llmTokens: 0 }
        let saved = false
        let llmMs: number | null = null
        let firstTokenMs: number | null = null

        try {
          send({ type: 'sources', sources: sources.map(s => toCitation(s, documentId)) })

          let text = ''
          let stopped = false
          const finish: { reason: string | null } = { reason: null }

          if (sources.length === 0) {
            text = NOT_FOUND_ANSWER
            send({ type: 'delta', text })
          } else {
            const llmTimer = timer()
            try {
              const deltas = chatStream({
                messages: buildMessages(question, sources, context),
                maxTokens: MAX_ANSWER_TOKENS,
                signal: abort.signal,
                onDone: info => {
                  usage.llmTokens = info.tokens
                  finish.reason = info.finishReason
                },
              })
              for await (const delta of deltas) {
                firstTokenMs ??= llmTimer()
                text += delta
                send({ type: 'delta', text: delta })
              }
            } catch (error) {
              if (!abort.signal.aborted) throw error
              stopped = true
            }
            llmMs = llmTimer()
          }

          // Stopped before any text: nothing worth keeping
          if (!text.trim()) {
            if (stopped) return
            throw new Error('Empty answer')
          }

          const result = finalizeAnswer(text, sources, documentId)
          const admin = createAdminClient()

          let title = conversation?.title ?? fallbackTitle(question)
          if (!conversation) {
            // Document ownership was checked above
            const { error } = await admin
              .from('conversations')
              .insert({ id: conversationId, user_id: user.id, document_id: documentId, title })
            if (error) throw new Error(`Failed to create conversation: ${error.message}`)
          }

          // Users can't write assistant messages, so both turns go in with the
          // service role
          const answeredAt = new Date(Math.max(Date.now(), startedAt.getTime() + 1))
          const { data: rows, error: saveError } = await admin
            .from('messages')
            .insert([
              { conversation_id: conversationId, role: 'user', content: question, created_at: startedAt.toISOString() },
              {
                conversation_id: conversationId,
                role: 'assistant',
                content: result.answer,
                created_at: answeredAt.toISOString(),
                metadata: assistantMetadata({
                  found: result.found,
                  citations: result.citations,
                  stopped,
                  truncated: finish.reason === 'length',
                }),
              },
            ])
            .select('id, role, content, metadata, created_at')
          if (saveError || !rows || rows.length !== 2) {
            throw new Error(`Failed to save messages: ${saveError?.message ?? 'unexpected result'}`)
          }
          saved = true

          const [userMessage, assistantMessage] = rows.sort((a, b) => a.created_at.localeCompare(b.created_at))
          send({
            type: 'done',
            created: !conversation,
            conversation: { id: conversationId, title, updated_at: answeredAt.toISOString() },
            messages: [toChatMessage(userMessage), toChatMessage(assistantMessage)],
          })

          // Housekeeping once the answer is delivered; failures here don't
          // affect the answer
          if (!conversation) {
            try {
              const generated = await generateTitle(question, result.answer)
              usage.llmTokens += generated.tokens
              title = generated.title
              await admin.from('conversations').update({ title }).eq('id', conversationId)
              send({ type: 'title', title })
            } catch (error) {
              log.warn('chat.title_failed', { conversation_id: conversationId, error })
            }
          }
          try {
            usage.llmTokens += await maybeSummarize(admin, conversationId)
          } catch (error) {
            log.warn('chat.summary_failed', { conversation_id: conversationId, error })
          }

          log.info('chat.answered', {
            user_id: user.id,
            document_id: documentId,
            conversation_id: conversationId,
            found: result.found,
            sources: sources.length,
            citations: result.citations.length,
            stopped,
            embedding_tokens: usage.embeddingTokens,
            llm_tokens: usage.llmTokens,
            retrieval_ms: retrievalMs,
            first_token_ms: firstTokenMs,
            llm_ms: llmMs,
            ms: elapsed(),
          })
        } catch (error: any) {
          log.error('chat.failed', { user_id: user.id, conversation_id: conversationId, ms: elapsed(), error })
          const timedOut = /timed out/i.test(error?.message ?? '')
          send({
            type: 'error',
            error: timedOut ? 'The answer took too long. Please try again.' : 'Failed to answer the question. Please try again.',
          })
        } finally {
          // Tokens were spent either way; the question only counts if answered
          await recordTokens(user.id, { embedding: usage.embeddingTokens, llm: usage.llmTokens }).catch(error =>
            log.error('usage.record_failed', { user_id: user.id, error })
          )
          if (!saved) {
            await refundQuestion(user.id).catch(error => log.error('usage.refund_failed', { user_id: user.id, error }))
          }
          try {
            controller.close()
          } catch {
            // Already closed by a disconnect
          }
        }
      },
      cancel() {
        abort.abort()
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no',
      },
    })
  } catch (error) {
    log.error('chat.failed', { user_id: userId, ms: elapsed(), error })
    if (questionCounted && userId) {
      await refundQuestion(userId).catch(err => log.error('usage.refund_failed', { user_id: userId, error: err }))
    }
    return NextResponse.json({ error: 'Failed to answer the question. Please try again.' }, { status: 500 })
  }
}
