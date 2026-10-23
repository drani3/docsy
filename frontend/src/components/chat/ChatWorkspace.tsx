'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import Link from 'next/link'
import type { ChatEvent, ChatMessage, ConversationListItem } from '@/lib/chat/types'
import { formatFileSize } from '@/lib/uploads'
import { showToast } from '@/components/ui/Toast'
import { SessionExpiredError, apiFetch, readApiError } from '@/lib/api-client'
import ConversationList from './ConversationList'
import MessageView, { type UiMessage } from './MessageView'
import { usePdfOpener } from './usePdfOpener'

const MAX_QUESTION_LENGTH = 2000
// Within this distance of the bottom, new content keeps the view pinned there
const STICK_THRESHOLD_PX = 80

interface Props {
  document: { id: string; filename: string; file_size: number; page_count: number | null }
  conversations: ConversationListItem[]
  // null starts a new conversation
  conversation: { id: string; title: string } | null
  initialMessages: ChatMessage[]
  hasMore: boolean
}

export default function ChatWorkspace({ document, conversations: initialConversations, conversation, initialMessages, hasMore: initialHasMore }: Props) {
  const [conversations, setConversations] = useState(initialConversations)
  const [messages, setMessages] = useState<UiMessage[]>(initialMessages)
  const [hasMore, setHasMore] = useState(initialHasMore)
  const [loadingMore, setLoadingMore] = useState(false)
  const [question, setQuestion] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [showList, setShowList] = useState(false) // mobile only

  // The id of a new conversation is chosen here, before the first question,
  // so it's known even if the user stops the first answer. It only exists on
  // the server once a question has been answered (`saved`).
  const conversationId = useRef<string | null>(conversation?.id ?? null)
  const [saved, setSaved] = useState(Boolean(conversation))
  const [title, setTitle] = useState(conversation?.title ?? null)

  const abortRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const stickToBottom = useRef(true)
  const prependAnchor = useRef<number | null>(null)
  const nextTempId = useRef(1)

  const openPage = usePdfOpener(document.id)

  useEffect(() => setMounted(true), [])

  // Stop a running answer when leaving the page
  useEffect(() => () => abortRef.current?.abort(), [])

  // Keep the newest message in view, unless the user scrolled up to read.
  // After loading older messages, keep the view where it was instead.
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    if (prependAnchor.current !== null) {
      el.scrollTop = el.scrollHeight - prependAnchor.current
      prependAnchor.current = null
    } else if (stickToBottom.current) {
      el.scrollTop = el.scrollHeight
    }
  }, [messages])

  const onScroll = () => {
    const el = scrollRef.current
    if (!el) return
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_THRESHOLD_PX
  }

  const updateMessage = (id: string, patch: Partial<UiMessage> | ((m: UiMessage) => Partial<UiMessage>)) =>
    setMessages(prev => prev.map(m => (m.id === id ? { ...m, ...(typeof patch === 'function' ? patch(m) : patch) } : m)))

  const rememberConversation = useCallback((item: ConversationListItem) => {
    setConversations(prev => [item, ...prev.filter(c => c.id !== item.id)])
    setSaved(true)
    setTitle(item.title)
    if (window.location.pathname !== `/conversations/${item.id}`) {
      window.history.replaceState(null, '', `/conversations/${item.id}`)
    }
  }, [])

  const ask = async (text: string) => {
    conversationId.current ??= crypto.randomUUID()
    const convId = conversationId.current
    const n = nextTempId.current++
    const userId = `pending-user-${n}`
    const assistantId = `pending-assistant-${n}`
    const now = new Date().toISOString()

    stickToBottom.current = true
    setMessages(prev => [
      ...prev,
      { id: userId, role: 'user', content: text, created_at: now },
      { id: assistantId, role: 'assistant', content: '', created_at: now, status: 'streaming' },
    ])

    const controller = new AbortController()
    abortRef.current = controller
    setStreaming(true)

    try {
      const response = await apiFetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document_id: document.id, conversation_id: convId, question: text }),
        signal: controller.signal,
      })
      if (!response.ok || !response.body) {
        const { message, upgrade } = await readApiError(response, 'Failed to answer the question')
        throw Object.assign(new Error(message), { upgrade })
      }

      let finished = false
      const handle = (event: ChatEvent) => {
        switch (event.type) {
          case 'sources':
            updateMessage(assistantId, { sources: event.sources })
            break
          case 'delta':
            updateMessage(assistantId, m => ({ content: m.content + event.text }))
            break
          case 'done': {
            finished = true
            const [savedQuestion, savedAnswer] = event.messages
            setMessages(prev =>
              prev.flatMap(m => (m.id === userId ? [savedQuestion] : m.id === assistantId ? [savedAnswer] : [m]))
            )
            rememberConversation(event.conversation)
            break
          }
          case 'title':
            setTitle(event.title)
            setConversations(prev => prev.map(c => (c.id === convId ? { ...c, title: event.title } : c)))
            break
          case 'error':
            throw new Error(event.error)
        }
      }

      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
      let buffer = ''
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += value
        let newline: number
        while ((newline = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, newline).trim()
          buffer = buffer.slice(newline + 1)
          if (line) handle(JSON.parse(line) as ChatEvent)
        }
        // The answer is saved and shown; stop waiting on title/summary work
        if (finished) setStreaming(false)
      }

      if (!finished) throw new Error('The connection was interrupted. Please try again.')
    } catch (error: any) {
      if (error instanceof SessionExpiredError) return
      if (controller.signal.aborted) {
        // The server keeps what was written so far
        updateMessage(assistantId, { status: undefined, stopped: true })
      } else {
        updateMessage(assistantId, {
          status: 'error',
          error: error.message || 'Failed to answer the question',
          upgrade: Boolean(error.upgrade),
        })
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null
      setStreaming(false)
    }
  }

  const retry = (assistantId: string) => {
    const index = messages.findIndex(m => m.id === assistantId)
    const failedQuestion = messages[index - 1]
    if (!failedQuestion || failedQuestion.role !== 'user') return
    setMessages(prev => prev.filter(m => m.id !== assistantId && m.id !== failedQuestion.id))
    ask(failedQuestion.content)
  }

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault()
    const text = question.trim()
    if (!text || streaming) return
    setQuestion('')
    ask(text)
  }

  const newConversation = () => {
    if (streaming) return
    conversationId.current = null
    setSaved(false)
    setTitle(null)
    setMessages([])
    setHasMore(false)
    setShowList(false)
    window.history.replaceState(null, '', `/documents/${document.id}`)
  }

  const loadEarlier = async () => {
    const first = messages.find(m => !m.id.startsWith('pending-'))
    if (!first || !conversationId.current) return
    setLoadingMore(true)
    try {
      const response = await apiFetch(
        `/api/conversations/${conversationId.current}/messages?before=${encodeURIComponent(first.created_at)}`
      )
      const body = await response.json().catch(() => null)
      if (!response.ok) throw new Error(body?.error || 'Failed to load messages')
      prependAnchor.current = scrollRef.current ? scrollRef.current.scrollHeight - scrollRef.current.scrollTop : null
      setMessages(prev => [...(body.messages as ChatMessage[]), ...prev])
      setHasMore(body.hasMore)
    } catch (error: any) {
      showToast('error', error.message)
    } finally {
      setLoadingMore(false)
    }
  }

  const onRenamed = (id: string, newTitle: string) => {
    setConversations(prev => prev.map(c => (c.id === id ? { ...c, title: newTitle } : c)))
    if (id === conversationId.current) setTitle(newTitle)
  }

  const onDeleted = (id: string) => {
    setConversations(prev => prev.filter(c => c.id !== id))
    if (id === conversationId.current) newConversation()
  }

  const activeId = saved ? conversationId.current : null

  return (
    <div className="flex h-[calc(100dvh-7rem)] min-h-[28rem] gap-6">
      {/* Conversations: a column on desktop, a drop-down panel on mobile */}
      <aside className="hidden w-60 shrink-0 md:block">
        <ConversationList
          conversations={conversations}
          activeId={activeId}
          disabled={streaming}
          onNew={newConversation}
          onRenamed={onRenamed}
          onDeleted={onDeleted}
        />
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="mb-3">
          <Link href="/documents" className="text-sm text-indigo-600 hover:text-indigo-800">
            ← All documents
          </Link>
          <div className="mt-1 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-xl font-bold" title={document.filename}>
                {document.filename}
              </h2>
              <p className="truncate text-sm text-gray-500">
                {title ?? 'New conversation'} · {formatFileSize(document.file_size)}
                {document.page_count ? ` · ${document.page_count} pages` : ''}
              </p>
            </div>
            <button
              onClick={() => setShowList(!showList)}
              className="shrink-0 rounded-lg border px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 md:hidden"
            >
              Conversations
            </button>
          </div>
          {showList && (
            <div className="mt-3 max-h-72 rounded-lg border bg-white p-3 shadow md:hidden">
              <ConversationList
                conversations={conversations}
                activeId={activeId}
                disabled={streaming}
                onNew={newConversation}
                onRenamed={onRenamed}
                onDeleted={onDeleted}
              />
            </div>
          )}
        </header>

        <div ref={scrollRef} onScroll={onScroll} className="flex-1 space-y-4 overflow-y-auto pr-1">
          {hasMore && (
            <div className="text-center">
              <button
                onClick={loadEarlier}
                disabled={loadingMore}
                className="text-sm text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
              >
                {loadingMore ? 'Loading...' : 'Load earlier messages'}
              </button>
            </div>
          )}

          {messages.length === 0 && (
            <div className="rounded-lg bg-white p-6 text-sm text-gray-600 shadow">
              Ask anything about this document. Answers only use the document&apos;s contents and cite the pages they
              come from. Follow-up questions keep the context of the conversation.
            </div>
          )}

          {messages.map(message => (
            <MessageView
              key={message.id}
              message={message}
              showTime={mounted && !message.id.startsWith('pending-')}
              onOpenPage={openPage}
              onRetry={message.status === 'error' && !streaming ? () => retry(message.id) : undefined}
            />
          ))}
        </div>

        <form onSubmit={submit} className="mt-3 flex items-end gap-3 rounded-lg bg-white p-3 shadow">
          <textarea
            value={question}
            onChange={e => setQuestion(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) submit(e)
            }}
            rows={2}
            maxLength={MAX_QUESTION_LENGTH}
            placeholder="Ask a question about this document..."
            className="max-h-40 flex-1 resize-none rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          {streaming ? (
            <button
              type="button"
              onClick={() => abortRef.current?.abort()}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Stop
            </button>
          ) : (
            <button
              type="submit"
              disabled={!question.trim()}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              Ask
            </button>
          )}
        </form>
      </section>
    </div>
  )
}
