'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { ConversationListItem } from '@/lib/chat/types'
import { showToast } from '@/components/ui/Toast'
import { apiFetch } from '@/lib/api-client'

export default function ConversationList({
  conversations,
  activeId,
  disabled,
  onNew,
  onRenamed,
  onDeleted,
}: {
  conversations: ConversationListItem[]
  activeId: string | null
  disabled: boolean // while an answer is streaming
  onNew: () => void
  onRenamed: (id: string, title: string) => void
  onDeleted: (id: string) => void
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  const startRename = (conversation: ConversationListItem) => {
    setEditingId(conversation.id)
    setDraft(conversation.title)
  }

  const saveRename = async (conversation: ConversationListItem) => {
    const title = draft.replace(/\s+/g, ' ').trim()
    setEditingId(null)
    if (!title || title === conversation.title) return

    setBusyId(conversation.id)
    try {
      const response = await apiFetch(`/api/conversations/${conversation.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      })
      const body = await response.json().catch(() => null)
      if (!response.ok) throw new Error(body?.error || 'Failed to rename conversation')
      onRenamed(conversation.id, body.title)
    } catch (error: any) {
      showToast('error', error.message)
    } finally {
      setBusyId(null)
    }
  }

  const remove = async (conversation: ConversationListItem) => {
    if (!confirm(`Delete "${conversation.title}"? This can't be undone.`)) return

    setBusyId(conversation.id)
    try {
      const response = await apiFetch(`/api/conversations/${conversation.id}`, { method: 'DELETE' })
      const body = await response.json().catch(() => null)
      if (!response.ok) throw new Error(body?.error || 'Failed to delete conversation')
      onDeleted(conversation.id)
      showToast('success', 'Conversation deleted')
    } catch (error: any) {
      showToast('error', error.message)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <button
        onClick={onNew}
        disabled={disabled}
        className="mb-3 w-full rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        New conversation
      </button>

      {conversations.length === 0 ? (
        <p className="px-1 text-xs text-gray-500">No conversations yet. Ask a question to start one.</p>
      ) : (
        <ul className="-mx-1 flex-1 space-y-1 overflow-y-auto px-1">
          {conversations.map(conversation => {
            const active = conversation.id === activeId
            return (
              <li key={conversation.id} className={busyId === conversation.id ? 'opacity-50' : ''}>
                {editingId === conversation.id ? (
                  <input
                    autoFocus
                    value={draft}
                    maxLength={200}
                    onChange={e => setDraft(e.target.value)}
                    onBlur={() => saveRename(conversation)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') e.currentTarget.blur()
                      if (e.key === 'Escape') setEditingId(null)
                    }}
                    className="w-full rounded-md border border-indigo-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                ) : (
                  <div
                    className={`group flex items-center rounded-md ${
                      active ? 'bg-indigo-50 text-indigo-700' : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <Link
                      href={`/conversations/${conversation.id}`}
                      aria-disabled={disabled}
                      onClick={e => {
                        if (disabled || active) e.preventDefault()
                      }}
                      className="min-w-0 flex-1 truncate px-2 py-1.5 text-sm"
                      title={conversation.title}
                    >
                      {conversation.title}
                    </Link>
                    <div className={`flex shrink-0 pr-1 ${active ? '' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'}`}>
                      <IconButton label="Rename" onClick={() => startRename(conversation)} disabled={busyId !== null}>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 13l6.232-6.232a2.5 2.5 0 113.536 3.536L12.536 16.5H9V13z" />
                      </IconButton>
                      <IconButton label="Delete" onClick={() => remove(conversation)} disabled={disabled || busyId !== null}>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3M4 7h16" />
                      </IconButton>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="rounded p-1 text-gray-400 hover:bg-white hover:text-gray-700 disabled:opacity-50"
    >
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        {children}
      </svg>
    </button>
  )
}
