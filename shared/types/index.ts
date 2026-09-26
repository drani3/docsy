export interface User {
  id: string
  email: string
  full_name?: string
  avatar_url?: string
  plan: 'free' | 'pro'
  created_at: string
}

export interface Document {
  id: string
  user_id: string
  title: string
  file_name: string
  file_size: number
  storage_path: string
  status: 'processing' | 'ready' | 'error'
  page_count?: number
  created_at: string
  updated_at: string
}

export interface Conversation {
  id: string
  user_id: string
  document_id: string
  title: string
  created_at: string
}

export interface Message {
  id: string
  conversation_id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

export interface Subscription {
  id: string
  user_id: string
  stripe_customer_id?: string
  stripe_subscription_id?: string
  stripe_price_id?: string
  status: string
  current_period_start?: string
  current_period_end?: string
  cancel_at_period_end: boolean
  created_at: string
  updated_at: string
}

export interface Usage {
  id: string
  user_id: string
  month: string
  questions_count: number
  documents_count: number
  embedding_tokens: number
  llm_tokens: number
  storage_bytes: number
  created_at: string
  updated_at: string
}
