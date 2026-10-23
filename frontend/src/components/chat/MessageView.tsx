'use client'

import { memo, useState } from 'react'
import Link from 'next/link'
import type { ChatMessage, Citation } from '@/lib/chat/types'
import Markdown from './Markdown'

export type UiMessage = ChatMessage & {
  status?: 'streaming' | 'error'
  error?: string
  upgrade?: boolean // the error is a plan limit Pro would lift
  sources?: Citation[] // everything retrieved, so markers resolve while streaming
}

function MessageView({
  message,
  showTime,
  onOpenPage,
  onRetry,
}: {
  message: UiMessage
  showTime: boolean
  onOpenPage: (page: number) => void
  onRetry?: () => void
}) {
  const time = showTime ? <MessageTime iso={message.created_at} /> : null

  if (message.role === 'user') {
    return (
      <div className="flex flex-col items-end">
        <div className="max-w-[85%] rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white whitespace-pre-wrap break-words">
          {message.content}
        </div>
        {time}
      </div>
    )
  }

  const citations = message.citations?.length ? message.citations : message.sources ?? []
  const empty = !message.content

  return (
    <div className="flex flex-col items-start">
      <div className="w-full max-w-[95%] rounded-lg bg-white p-4 text-sm shadow">
        {message.status === 'streaming' && empty && (
          <div className="flex items-center gap-2 text-gray-500">
            <span className="h-2 w-2 animate-pulse rounded-full bg-indigo-500" />
            Searching the document...
          </div>
        )}

        {!empty && (
          <div className={message.found === false ? 'italic text-gray-600' : 'text-gray-900'}>
            <Markdown text={message.content} citations={citations} onOpenPage={onOpenPage} />
            {message.status === 'streaming' && (
              <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-gray-400 align-text-bottom" />
            )}
          </div>
        )}

        {message.stopped && (
          <p className="mt-2 text-xs text-gray-500">{empty ? 'Stopped before an answer was written.' : 'Stopped.'}</p>
        )}
        {message.truncated && <p className="mt-2 text-xs text-gray-500">The answer was cut off at the length limit.</p>}

        {message.status === 'error' && (
          <div className="flex items-center justify-between gap-4">
            <p className="text-red-700">
              {message.error}
              {message.upgrade && (
                <>
                  {' '}
                  <Link href="/settings" className="font-medium text-indigo-600 hover:text-indigo-800">
                    Upgrade to Pro
                  </Link>
                </>
              )}
            </p>
            {onRetry && !message.upgrade && (
              <button onClick={onRetry} className="shrink-0 text-indigo-600 hover:text-indigo-800">
                Retry
              </button>
            )}
          </div>
        )}

        {message.status !== 'streaming' && message.citations && message.citations.length > 0 && (
          <Sources citations={message.citations} onOpenPage={onOpenPage} />
        )}
      </div>
      {message.status !== 'streaming' && time}
    </div>
  )
}

export default memo(MessageView)

function Sources({ citations, onOpenPage }: { citations: Citation[]; onOpenPage: (page: number) => void }) {
  const [expanded, setExpanded] = useState<number | null>(null)
  return (
    <div className="mt-4 border-t pt-3">
      <p className="mb-2 text-xs font-medium text-gray-500">Sources</p>
      <ul className="space-y-2">
        {citations.map(c => (
          <li key={c.source} className="text-xs">
            <div className="flex items-center gap-3">
              <button onClick={() => onOpenPage(c.page)} className="font-medium text-indigo-600 hover:text-indigo-800">
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
              <blockquote className="mt-1 border-l-2 border-gray-200 pl-3 whitespace-pre-wrap text-gray-600">
                {c.excerpt}
              </blockquote>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

// Rendered only after mount (showTime), so the server's time zone never shows
function MessageTime({ iso }: { iso: string }) {
  const date = new Date(iso)
  const sameDay = date.toDateString() === new Date().toDateString()
  const label = sameDay
    ? date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  return (
    <time dateTime={iso} title={date.toLocaleString()} className="mt-1 px-1 text-[11px] text-gray-400">
      {label}
    </time>
  )
}
