export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string | null
          name: string | null
          avatar_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email?: string | null
          name?: string | null
          avatar_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string | null
          name?: string | null
          avatar_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      documents: {
        Row: {
          id: string
          user_id: string
          filename: string
          storage_key: string
          file_size: number
          mime_type: string
          status: 'uploading' | 'processing' | 'embedding' | 'ready' | 'failed'
          page_count: number | null
          error_message: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          filename: string
          storage_key: string
          file_size: number
          mime_type?: string
          status?: 'uploading' | 'processing' | 'embedding' | 'ready' | 'failed'
          page_count?: number | null
          error_message?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          filename?: string
          storage_key?: string
          file_size?: number
          mime_type?: string
          status?: 'uploading' | 'processing' | 'embedding' | 'ready' | 'failed'
          page_count?: number | null
          error_message?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      document_chunks: {
        Row: {
          id: string
          document_id: string
          chunk_index: number
          page_number: number | null
          content: string
          metadata: Json
          created_at: string
        }
        Insert: {
          id?: string
          document_id: string
          chunk_index: number
          page_number?: number | null
          content: string
          metadata?: Json
          created_at?: string
        }
        Update: {
          id?: string
          document_id?: string
          chunk_index?: number
          page_number?: number | null
          content?: string
          metadata?: Json
          created_at?: string
        }
        Relationships: []
      }
      conversations: {
        Row: {
          id: string
          user_id: string
          title: string
          summary: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          title?: string
          summary?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          title?: string
          summary?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          id: string
          conversation_id: string
          role: 'user' | 'assistant' | 'system'
          content: string
          created_at: string
        }
        Insert: {
          id?: string
          conversation_id: string
          role: 'user' | 'assistant' | 'system'
          content: string
          created_at?: string
        }
        Update: {
          id?: string
          conversation_id?: string
          role?: 'user' | 'assistant' | 'system'
          content?: string
          created_at?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          id: string
          user_id: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          plan: 'free' | 'pro'
          status: string | null
          current_period_start: string | null
          current_period_end: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          plan?: 'free' | 'pro'
          status?: string | null
          current_period_start?: string | null
          current_period_end?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          plan?: 'free' | 'pro'
          status?: string | null
          current_period_start?: string | null
          current_period_end?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      usage: {
        Row: {
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
        Insert: {
          id?: string
          user_id: string
          period: string
          questions?: number
          documents?: number
          embedding_tokens?: number
          llm_tokens?: number
          storage_bytes?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          period?: string
          questions?: number
          documents?: number
          embedding_tokens?: number
          llm_tokens?: number
          storage_bytes?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      document_status: 'uploading' | 'processing' | 'embedding' | 'ready' | 'failed'
      message_role: 'user' | 'assistant' | 'system'
      subscription_plan: 'free' | 'pro'
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
