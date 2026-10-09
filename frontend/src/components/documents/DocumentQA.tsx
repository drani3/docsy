'use client'

import { Fragment, useRef, useState } from 'react'
import { showToast } from '@/components/ui/Toast'

interface Citation {
  source: number
  document_id: string
  chunk_id: string
  page: number
  excerpt: string
}

interface Exchange {
  id: number
  question: string
  status: 'pending' | 'done' | 'error'
  answer?: string
  found?: boolean
  citations?: Citation[]
  error?: string
}

// Signed URLs are valid for 5 minutes; reuse one for a little less than that
const URL_REUSE_MS = 4 * 60 * 1000

export default function DocumentQA({ documentId }: { documentId: string }) {
  const [question, setQuestion] = useState('')
  const [exchanges, setExchanges] = useState<Exchange[]>([])
  const nextId = useRef(1)
  const viewUrl = useRef<{ url: string; at: number } | null>(null)

  const pending = exchanges.some(e => e.status === 'pending')

  const ask = async (text: string, existingId?: number) => {
    const id = existingId ?? nextId.current++
    setExchanges(prev =>
      existingId
        ? prev.map(e => (e.id === id ? { id, question: text, status: 'pending' } : e))
        : [...prev, { id, question: text, status: 'pending' }]
    )

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document_id: documentId, question: text }),
      })
      const body = await response.json().catch(() => null)
      if (!response.ok) throw new Error(body?.error || 'Failed to answer the question')

      setExchanges(prev =>
        prev.map(e =>
          e.id === id ? { ...e, status: 'done', answer: body.answer, found: body.found, citations: body.citations } : e
        )
      )
    } catch (error: any) {
      setExchanges(prev => prev.map(e => (e.id === id ? { ...e, status: 'error', error: error.message } : e)))
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const text = question.trim()
    if (!text || pending) return
    setQuestion('')
    ask(text)
  }

  // Open the PDF at a page. The tab is opened synchronously (so it isn't
  // treated as a pop-up), then pointed at the signed URL once we have it.
  const openPage = async (page: number) => {
    const tab = window.open('', '_blank')
    try {
      let url = viewUrl.current && Date.now() - viewUrl.current.at < URL_REUSE_MS ? viewUrl.current.url : null
      if (!url) {
        const response = await fetch(`/api/documents/${documentId}/download?inline=1`)
        const body = await response.json().catch(() => null)
        if (!response.ok) throw new Error(body?.error || 'Failed to open document')
        url = body.url as string
        viewUrl.current = { url, at: Date.now() }
      }
      const target = `${url}#page=${page}`
      if (tab) tab.location.href = target
      else window.location.href = target
    } catch (error: any) {
      tab?.close()
      showToast('error', error.message || 'Failed to open document')
    }
  }

  return (
    <div className="space-y-6">
      {exchanges.length === 0 && (
        <div className="bg-white rounded-lg shadow p-6 text-sm text-gray-600">
          Ask anything about this document. Answers only use the document&apos;s contents and cite the pages
          they come from.
        </div>
      )}

      {exchanges.map(exchange => (
        <div key={exchange.id} className="space-y-3">
          <div className="flex justify-end">
            <div className="max-w-[85%] rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm whitespace-pre-wrap">
              {exchange.question}
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-4 text-sm">
            {exchange.status === 'pending' && (
              <div className="flex items-center gap-2 text-gray-500">
                <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                Searching the document...
              </div>
            )}

            {exchange.status === 'error' && (
              <div className="flex items-center justify-between gap-4">
                <p className="text-red-700">{exchange.error}</p>
                <button
                  onClick={() => ask(exchange.question, exchange.id)}
                  disabled={pending}
                  className="text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
                >
                  Retry
                </button>
              </div>
            )}

            {exchange.status === 'done' && (
              <>
                <p className={`whitespace-pre-wrap leading-relaxed ${exchange.found ? 'text-gray-900' : 'text-gray-600 italic'}`}>
                  <AnswerText text={exchange.answer ?? ''} citations={exchange.citations ?? []} onOpen={openPage} />
                </p>
                {exchange.citations && exchange.citations.length > 0 && (
                  <Sources citations={exchange.citations} onOpen={openPage} />
                )}
              </>
            )}
          </div>
        </div>
      ))}

      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-3 flex gap-3 items-end">
        <textarea
          value={question}
          onChange={e => setQuestion(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) handleSubmit(e)
          }}
          rows={2}
          maxLength={2000}
          placeholder="Ask a question about this document..."
          className="flex-1 resize-none rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <button
          type="submit"
          disabled={pending || !question.trim()}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50"
        >
          {pending ? 'Asking...' : 'Ask'}
        </button>
      </form>
    </div>
  )
}

// Renders [n] markers as small clickable page links
function AnswerText({
  text,
  citations,
  onOpen,
}: {
  text: string
  citations: Citation[]
  onOpen: (page: number) => void
}) {
  const bySource = new Map(citations.map(c => [c.source, c]))
  return (
    <>
      {text.split(/(\[\d+\])/g).map((part, i) => {
        const match = part.match(/^\[(\d+)\]$/)
        const citation = match ? bySource.get(Number(match[1])) : undefined
        if (!citation) return <Fragment key={i}>{match ? '' : part}</Fragment>
        return (
          <button
            key={i}
            onClick={() => onOpen(citation.page)}
            title={`Open page ${citation.page}`}
            className="mx-0.5 inline-flex items-center rounded bg-indigo-50 px-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100 align-baseline"
          >
            p.{citation.page}
          </button>
        )
      })}
    </>
  )
}

function Sources({ citations, onOpen }: { citations: Citation[]; onOpen: (page: number) => void }) {
  const [expanded, setExpanded] = useState<number | null>(null)
  return (
    <div className="mt-4 border-t pt-3">
      <p className="text-xs font-medium text-gray-500 mb-2">Sources</p>
      <ul className="space-y-2">
        {citations.map(c => (
          <li key={c.source} className="text-xs">
            <div className="flex items-center gap-3">
              <button onClick={() => onOpen(c.page)} className="font-medium text-indigo-600 hover:text-indigo-800">
                Page {c.page}
              </button>
              <button
                onClick={() => setExpanded(expanded === c.source ? null : c.source)}
                className="text-gray-500 hover:text-gray-700"
              >
                {expanded === c.source ? 'Hide excerpt' : 'Show excerpt'}
              </button>
            </div>
            {expanded === c.source && (
              <blockquote className="mt-1 border-l-2 border-gray-200 pl-3 text-gray-600 whitespace-pre-wrap">
                {c.excerpt}
              </blockquote>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
