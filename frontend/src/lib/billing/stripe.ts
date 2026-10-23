import 'server-only'
import Stripe from 'stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireEnv } from '@/lib/ai/http'

let client: Stripe | null = null

export function stripe() {
  client ??= new Stripe(requireEnv('STRIPE_SECRET_KEY'), {
    // Pinned so a Stripe-side default change can't alter webhook payloads
    apiVersion: '2025-02-24.acacia',
    maxNetworkRetries: 2,
    timeout: 20_000,
  })
  return client
}

export function isStripeConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRO_MONTHLY_PRICE_ID)
}

export type BillingInterval = 'month' | 'year'

// Price ids come from server config only; the browser just names an interval
export function proPriceId(interval: BillingInterval): string | null {
  return (interval === 'year' ? process.env.STRIPE_PRO_YEARLY_PRICE_ID : process.env.STRIPE_PRO_MONTHLY_PRICE_ID) || null
}

function isProPrice(priceId: string | undefined) {
  return Boolean(priceId) && [process.env.STRIPE_PRO_MONTHLY_PRICE_ID, process.env.STRIPE_PRO_YEARLY_PRICE_ID].includes(priceId)
}

// Returns the user's Stripe customer, creating it on first checkout
export async function ensureCustomer(user: { id: string; email?: string | null }): Promise<string> {
  const admin = createAdminClient()
  const { data: subscription } = await admin
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (subscription?.stripe_customer_id) return subscription.stripe_customer_id

  const customer = await stripe().customers.create(
    { email: user.email ?? undefined, metadata: { user_id: user.id } },
    // Two checkouts started at once get the same customer
    { idempotencyKey: `customer-${user.id}` }
  )

  const { error } = await admin
    .from('subscriptions')
    .upsert({ user_id: user.id, stripe_customer_id: customer.id }, { onConflict: 'user_id' })
  if (error) throw new Error(`Failed to store Stripe customer: ${error.message}`)

  return customer.id
}

// Copies a subscription's current state from Stripe into Postgres. Always
// re-reads the subscription from Stripe rather than trusting the event body,
// so events can arrive late, twice or out of order and the result is the same.
export async function syncSubscription(subscriptionId: string) {
  const subscription = await stripe().subscriptions.retrieve(subscriptionId)
  const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id

  const admin = createAdminClient()
  let userId = subscription.metadata?.user_id || null
  if (!userId) {
    const { data } = await admin.from('subscriptions').select('user_id').eq('stripe_customer_id', customerId).maybeSingle()
    userId = data?.user_id ?? null
  }
  if (!userId) {
    throw new Error(`No user found for Stripe customer ${customerId}`)
  }

  // A user has one subscription row. Ignore stale events about an older
  // Stripe subscription once a newer one is stored.
  const { data: existing } = await admin
    .from('subscriptions')
    .select('stripe_subscription_id, status')
    .eq('user_id', userId)
    .maybeSingle()
  if (
    existing?.stripe_subscription_id &&
    existing.stripe_subscription_id !== subscription.id &&
    ['active', 'trialing', 'past_due'].includes(existing.status ?? '') &&
    subscription.status === 'canceled'
  ) {
    return { userId, ignored: true as const }
  }

  const priceId = subscription.items.data[0]?.price.id
  const { error } = await admin.from('subscriptions').upsert(
    {
      user_id: userId,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscription.id,
      plan: isProPrice(priceId) ? 'pro' : 'free',
      status: subscription.status,
      price_id: priceId ?? null,
      cancel_at_period_end: subscription.cancel_at_period_end,
      current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
      current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
    },
    { onConflict: 'user_id' }
  )
  if (error) throw new Error(`Failed to store subscription: ${error.message}`)

  return { userId, ignored: false as const, status: subscription.status }
}
