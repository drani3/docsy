export type DocumentStatus = 'uploading' | 'processing' | 'embedding' | 'ready' | 'failed';
export type MessageRole = 'user' | 'assistant' | 'system';

export interface Profile {
  id: string
  email?: string
  name?: string
  avatar_url?: string
  created_at: string
  updated_at: string
}

export interface Document {
  id: string
  user_id: string
  filename: string
  storage_key: string
  file_size: number
  mime_type?: string
  status: DocumentStatus
  page_count?: number
  created_at: string
  updated_at: string
}

export interface DocumentChunk {
  id: string
  document_id: string
  chunk_index: number
  page_number?: number
  content: string
  metadata?: Record<string, unknown>
  created_at: string
}

export interface Conversation {
  id: string
  user_id: string
  title: string
  summary?: string
  created_at: string
  updated_at: string
}

export interface Message {
  id: string
  conversation_id: string
  role: MessageRole
  content: string
  created_at: string
}

export interface Subscription {
  id: string
  user_id: string
  stripe_customer_id?: string
  stripe_subscription_id?: string
  plan?: string
  status?: string
  current_period_start?: string
  current_period_end?: string
  created_at: string
  updated_at: string
}

export interface Usage {
  id: string
  user_id: string
  period: string
  questions: number
  documents: number
  embedding_tokens: number
  llm_tokens: number
  storage_bytes: number
  created_at: string
  updated_at: string
}
