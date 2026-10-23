import 'server-only'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { log } from '@/lib/log'

// Per-user request limits, counted in Postgres (hit_rate_limit) so they hold
// across serverless instances. Generous enough never to bother normal use;
// they stop scripts from running up OpenAI, Pinecone and R2 costs.
export const RATE_LIMITS = {
  chat: { windowSeconds: 60, max: 20 },
  upload: { windowSeconds: 60, max: 10 },
  process: { windowSeconds: 60, max: 10 },
  billing: { windowSeconds: 60, max: 10 },
  default: { windowSeconds: 60, max: 60 },
} as const

export type RateLimitName = keyof typeof RATE_LIMITS

// Returns a 429 response when the user is over the limit, otherwise null.
// If the check itself fails the request is let through (fail open): a
// database hiccup shouldn't take the app down.
export async function rateLimit(name: RateLimitName, userId: string): Promise<NextResponse | null> {
  const { windowSeconds, max } = RATE_LIMITS[name]
  try {
    const { data: allowed, error } = await createAdminClient().rpc('hit_rate_limit', {
      p_key: `${name}:${userId}`,
      p_window_seconds: windowSeconds,
      p_max: max,
    })
    if (error) throw error
    if (allowed) return null

    log.warn('rate_limit.exceeded', { limit: name, user_id: userId })
    return NextResponse.json(
      { error: 'Too many requests. Please wait a moment and try again.' },
      { status: 429, headers: { 'Retry-After': String(windowSeconds) } }
    )
  } catch (error) {
    log.error('rate_limit.check_failed', { limit: name, error })
    return null
  }
}
