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
          document_id: string
          title: string
          summary: string | null
          summary_message_count: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          document_id: string
          title?: string
          summary?: string | null
          summary_message_count?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          document_id?: string
          title?: string
          summary?: string | null
          summary_message_count?: number
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
          metadata: Json
          created_at: string
        }
        Insert: {
          id?: string
          conversation_id: string
          role: 'user' | 'assistant' | 'system'
          content: string
          metadata?: Json
          created_at?: string
        }
        Update: {
          id?: string
          conversation_id?: string
          role?: 'user' | 'assistant' | 'system'
          content?: string
          metadata?: Json
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
          price_id: string | null
          cancel_at_period_end: boolean
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
          price_id?: string | null
          cancel_at_period_end?: boolean
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
          price_id?: string | null
          cancel_at_period_end?: boolean
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
      stripe_events: {
        Row: {
          id: string
          type: string
          created_at: string
        }
        Insert: {
          id: string
          type: string
          created_at?: string
        }
        Update: {
          id?: string
          type?: string
          created_at?: string
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          key: string
          window_start: string
          count: number
        }
        Insert: {
          key: string
          window_start: string
          count?: number
        }
        Update: {
          key?: string
          window_start?: string
          count?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_document: {
        Args: {
          p_id: string
          p_user_id: string
          p_filename: string
          p_storage_key: string
          p_file_size: number
          p_max_documents: number
        }
        Returns: boolean
      }
      record_usage: {
        Args: {
          p_user_id: string
          p_questions?: number
          p_documents?: number
          p_embedding_tokens?: number
          p_llm_tokens?: number
          p_storage_bytes?: number
        }
        Returns: undefined
      }
      consume_question: {
        Args: { p_user_id: string; p_limit: number }
        Returns: boolean
      }
      hit_rate_limit: {
        Args: { p_key: string; p_window_seconds: number; p_max: number }
        Returns: boolean
      }
      current_usage_period: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
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
