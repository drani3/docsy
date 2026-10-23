import 'server-only'
import type { Database } from '@shared/types/database'
import { createAdminClient } from '@/lib/supabase/admin'
import { PLAN_LIMITS, type AccountSummary, type Plan, type PlanLimits } from './plans'

// The one place that decides what a user may do. Routes ask
// checkEntitlement() instead of looking at the plan themselves.

type SubscriptionRow = Pick<
  Database['public']['Tables']['subscriptions']['Row'],
  'plan' | 'status' | 'current_period_start' | 'current_period_end' | 'cancel_at_period_end' | 'stripe_customer_id'
>

// After a renewal payment fails Stripe retries for a while (status past_due);
// Pro stays on for this long from the start of the unpaid period.
export const GRACE_PERIOD_DAYS = 7
const DAY_MS = 24 * 60 * 60 * 1000

// Stripe status → effective plan. Canceled subscriptions stay "active" in
// Stripe until the period they paid for ends, so cancellation needs no
// special case here.
export function resolvePlan(subscription: SubscriptionRow | null, now = new Date()): { plan: Plan; graceUntil: Date | null } {
  if (!subscription || subscription.plan !== 'pro') return { plan: 'free', graceUntil: null }

  switch (subscription.status) {
    case 'active':
    case 'trialing':
      return { plan: 'pro', graceUntil: null }
    case 'past_due': {
      const start = subscription.current_period_start ? new Date(subscription.current_period_start) : null
      const graceUntil = start ? new Date(start.getTime() + GRACE_PERIOD_DAYS * DAY_MS) : null
      return graceUntil && now < graceUntil ? { plan: 'pro', graceUntil } : { plan: 'free', graceUntil: null }
    }
    default:
      // canceled, unpaid, incomplete, incomplete_expired, paused
      return { plan: 'free', graceUntil: null }
  }
}

export type Feature = 'upload_document' | 'ask_question'

export type EntitlementResult =
  | { allowed: true; plan: Plan; limits: PlanLimits }
  | { allowed: false; plan: Plan; limits: PlanLimits; reason: string; upgrade: boolean }

async function loadSubscription(userId: string) {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('subscriptions')
    .select('plan, status, current_period_start, current_period_end, cancel_at_period_end, stripe_customer_id')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw new Error(`Failed to load subscription: ${error.message}`)
  return data
}

export async function getPlan(userId: string): Promise<{ plan: Plan; limits: PlanLimits }> {
  const { plan } = resolvePlan(await loadSubscription(userId))
  return { plan, limits: PLAN_LIMITS[plan] }
}

// Checks a feature and, for metered features, records the use atomically:
// a question is counted here, so call it once per question asked (and
// refundQuestion() if the answer then fails).
export async function checkEntitlement(
  userId: string,
  feature: Feature,
  details: { fileSize?: number } = {}
): Promise<EntitlementResult> {
  const { plan, limits } = await getPlan(userId)
  const deny = (reason: string): EntitlementResult => ({ allowed: false, plan, limits, reason, upgrade: plan === 'free' })

  switch (feature) {
    case 'upload_document': {
      // The document count itself is enforced by create_document() in the
      // database, under a lock
      if (details.fileSize !== undefined && details.fileSize > limits.maxFileSize) {
        return deny(`Files on the ${plan === 'free' ? 'Free' : 'Pro'} plan can be up to ${limits.maxFileSize / (1024 * 1024)}MB`)
      }
      return { allowed: true, plan, limits }
    }
    case 'ask_question': {
      const admin = createAdminClient()
      const { data: allowed, error } = await admin.rpc('consume_question', {
        p_user_id: userId,
        p_limit: limits.questionsPerMonth,
      })
      if (error) throw new Error(`Failed to check question limit: ${error.message}`)
      if (!allowed) {
        return deny(`You've used all ${limits.questionsPerMonth} questions for this month`)
      }
      return { allowed: true, plan, limits }
    }
  }
}

export async function refundQuestion(userId: string) {
  const { error } = await createAdminClient().rpc('record_usage', { p_user_id: userId, p_questions: -1 })
  if (error) throw new Error(`Failed to refund question: ${error.message}`)
}

export async function recordTokens(userId: string, tokens: { embedding?: number; llm?: number }) {
  if (!tokens.embedding && !tokens.llm) return
  const { error } = await createAdminClient().rpc('record_usage', {
    p_user_id: userId,
    p_embedding_tokens: tokens.embedding ?? 0,
    p_llm_tokens: tokens.llm ?? 0,
  })
  if (error) throw new Error(`Failed to record usage: ${error.message}`)
}

export async function getAccountSummary(userId: string): Promise<AccountSummary> {
  const admin = createAdminClient()
  const [subscription, { data: period }, { count: documents }] = await Promise.all([
    loadSubscription(userId),
    admin.rpc('current_usage_period'),
    admin.from('documents').select('id', { count: 'exact', head: true }).eq('user_id', userId),
  ])
  const { data: usage } = await admin
    .from('usage')
    .select('questions')
    .eq('user_id', userId)
    .eq('period', period ?? '')
    .maybeSingle()

  const { plan, graceUntil } = resolvePlan(subscription)
  return {
    plan,
    limits: PLAN_LIMITS[plan],
    usage: { questions: usage?.questions ?? 0, documents: documents ?? 0 },
    subscription: {
      status: subscription?.status ?? null,
      currentPeriodEnd: subscription?.current_period_end ?? null,
      cancelAtPeriodEnd: subscription?.cancel_at_period_end ?? false,
      graceUntil: graceUntil?.toISOString() ?? null,
      hasBillingAccount: Boolean(subscription?.stripe_customer_id),
    },
  }
}
