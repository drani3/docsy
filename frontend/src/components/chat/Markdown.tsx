'use client'

import { memo } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Citation } from '@/lib/chat/types'

const CITE_PREFIX = '#cite-'

// Turns [n] markers into links the renderer below shows as page buttons.
// Fenced code blocks are left alone.
function linkCitations(text: string) {
  return text
    .split(/(```[\s\S]*?(?:```|$))/g)
    .map((part, i) => (i % 2 === 1 ? part : part.replace(/\[(\d+)\]/g, `[$1](${CITE_PREFIX}$1)`)))
    .join('')
}

function Markdown({
  text,
  citations,
  onOpenPage,
}: {
  text: string
  citations: Citation[]
  onOpenPage: (page: number) => void
}) {
  const bySource = new Map(citations.map(c => [c.source, c]))

  const components: Components = {
    a({ href, children }) {
      if (href?.startsWith(CITE_PREFIX)) {
        const citation = bySource.get(Number(href.slice(CITE_PREFIX.length)))
        // Markers that don't match a source are dropped
        if (!citation) return null
        return (
          <button
            type="button"
            onClick={() => onOpenPage(citation.page)}
            title={`Open page ${citation.page}`}
            className="mx-0.5 inline-flex items-center rounded bg-indigo-50 px-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100 align-baseline"
          >
            p.{citation.page}
          </button>
        )
      }
      return (
        <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="text-indigo-600 underline">
          {children}
        </a>
      )
    },
    p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0 leading-relaxed">{children}</p>,
    ul: ({ children }) => <ul className="my-2 list-disc pl-5 space-y-1">{children}</ul>,
    ol: ({ children }) => <ol className="my-2 list-decimal pl-5 space-y-1">{children}</ol>,
    h1: ({ children }) => <h3 className="mt-3 mb-1 text-base font-semibold">{children}</h3>,
    h2: ({ children }) => <h3 className="mt-3 mb-1 text-base font-semibold">{children}</h3>,
    h3: ({ children }) => <h4 className="mt-3 mb-1 font-semibold">{children}</h4>,
    blockquote: ({ children }) => (
      <blockquote className="my-2 border-l-2 border-gray-300 pl-3 text-gray-600">{children}</blockquote>
    ),
    pre: ({ children }) => (
      <pre className="my-2 overflow-x-auto rounded-md bg-gray-900 p-3 text-xs leading-relaxed text-gray-100">
        {children}
      </pre>
    ),
    code({ className, children }) {
      // Block code is wrapped in <pre> above and carries a language class or a newline
      const isBlock = /language-/.test(className ?? '') || String(children).includes('\n')
      return isBlock ? (
        <code className={`font-mono ${className ?? ''}`}>{children}</code>
      ) : (
        <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-[0.85em]">{children}</code>
      )
    },
    table: ({ children }) => (
      <div className="my-2 overflow-x-auto">
        <table className="min-w-full border-collapse text-xs">{children}</table>
      </div>
    ),
    th: ({ children }) => <th className="border border-gray-200 bg-gray-50 px-2 py-1 text-left font-medium">{children}</th>,
    td: ({ children }) => <td className="border border-gray-200 px-2 py-1 align-top">{children}</td>,
    img: () => null, // never load remote images named in an answer
  }

  return (
    <div className="break-words">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {linkCitations(text)}
      </ReactMarkdown>
    </div>
  )
}

export default memo(Markdown)
