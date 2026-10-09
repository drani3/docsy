import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { Database } from '@shared/types/database'

// Service-role client: bypasses RLS. Only for server-side jobs that write
// tables users can't (document_chunks, ingestion status, usage, billing).
// Always verify ownership with the user's session client before using this.
export function createAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')
  }

  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
