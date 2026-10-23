// Shapes shared by the chat API and the chat UI

export interface Citation {
  source: number // the [n] marker used in the answer
  document_id: string
  chunk_id: string
  page: number
  excerpt: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
  // Assistant messages only
  found?: boolean
  citations?: Citation[]
  stopped?: boolean // the user pressed Stop; content is partial
  truncated?: boolean // hit the answer length limit
}

export interface ConversationListItem {
  id: string
  title: string
  updated_at: string
}

// POST /api/chat streams newline-delimited JSON, one event per line:
//   sources → delta* → done → title?      (or error at any point)
export type ChatEvent =
  | { type: 'sources'; sources: Citation[] }
  | { type: 'delta'; text: string }
  | { type: 'done'; conversation: ConversationListItem; created: boolean; messages: [ChatMessage, ChatMessage] }
  | { type: 'title'; title: string }
  | { type: 'error'; error: string }
