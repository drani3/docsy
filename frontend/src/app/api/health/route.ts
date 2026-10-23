import { createAdminClient } from '@/lib/supabase/admin'
import { isPineconeConfigured } from '@/lib/vector/pinecone'
import { isStripeConfigured } from '@/lib/billing/stripe'
import { log } from '@/lib/log'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Ingestion that hasn't moved for this long is stuck (its request died)
const STUCK_AFTER_MINUTES = 10

// GET /api/health — for an uptime monitor. Public callers get only up/down.
// With `Authorization: Bearer $HEALTH_CHECK_TOKEN` it also reports which
// services are configured and the ingestion backlog (stuck and failed
// documents), for alerting.
export async function GET(request: Request) {
  const admin = createAdminClient()
  const { error: dbError } = await admin.from('profiles').select('id', { head: true, count: 'exact' }).limit(1)
  const ok = !dbError
  if (dbError) log.error('health.database_down', { error: dbError.message })

  const token = process.env.HEALTH_CHECK_TOKEN
  const authorized = Boolean(token) && request.headers.get('authorization') === `Bearer ${token}`
  if (!authorized) {
    return NextResponse.json({ ok }, { status: ok ? 200 : 503 })
  }

  const stuckBefore = new Date(Date.now() - STUCK_AFTER_MINUTES * 60_000).toISOString()
  const dayAgo = new Date(Date.now() - 24 * 60 * 60_000).toISOString()
  const [stuck, failed] = await Promise.all([
    admin
      .from('documents')
      .select('id', { count: 'exact', head: true })
      .in('status', ['processing', 'embedding'])
      .lt('updated_at', stuckBefore),
    admin
      .from('documents')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'failed')
      .gt('updated_at', dayAgo),
  ])

  return NextResponse.json(
    {
      ok,
      services: {
        database: ok,
        openai: Boolean(process.env.OPENAI_API_KEY),
        pinecone: isPineconeConfigured(),
        r2: Boolean(process.env.R2_ACCESS_KEY_ID && process.env.R2_BUCKET_NAME),
        stripe: isStripeConfigured(),
        stripe_webhook: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
      },
      ingestion: {
        stuck: stuck.count ?? null,
        failed_last_24h: failed.count ?? null,
      },
    },
    { status: ok ? 200 : 503 }
  )
}
