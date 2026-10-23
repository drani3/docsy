import { createClient } from '@/lib/supabase/server'
import { getPlan } from '@/lib/billing/entitlements'
import { ensureCustomer, isStripeConfigured, proPriceId, stripe, type BillingInterval } from '@/lib/billing/stripe'
import { rateLimit } from '@/lib/rate-limit'
import { log } from '@/lib/log'
import { NextResponse } from 'next/server'

// POST /api/billing/checkout  { interval: 'month' | 'year' } → { url }
// Starts Stripe Checkout for Pro. The plan only changes once the webhook
// confirms payment; returning to success_url proves nothing.
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const limited = await rateLimit('billing', user.id)
    if (limited) return limited

    if (!isStripeConfigured()) {
      return NextResponse.json({ error: 'Billing is not set up yet' }, { status: 503 })
    }

    const body = await request.json().catch(() => null)
    const interval: BillingInterval = body?.interval === 'year' ? 'year' : 'month'
    const price = proPriceId(interval)
    if (!price) {
      return NextResponse.json({ error: 'That billing interval is not available' }, { status: 400 })
    }

    const { plan } = await getPlan(user.id)
    if (plan === 'pro') {
      return NextResponse.json({ error: 'You are already on Pro. Manage your plan from the billing portal.' }, { status: 409 })
    }

    const customer = await ensureCustomer(user)
    const origin = new URL(request.url).origin

    const session = await stripe().checkout.sessions.create({
      mode: 'subscription',
      customer,
      client_reference_id: user.id,
      line_items: [{ price, quantity: 1 }],
      // The webhook maps the subscription back to the user through this
      subscription_data: { metadata: { user_id: user.id } },
      metadata: { user_id: user.id },
      allow_promotion_codes: true,
      success_url: `${origin}/settings?checkout=success`,
      cancel_url: `${origin}/settings?checkout=cancelled`,
    })

    log.info('billing.checkout_started', { user_id: user.id, interval })
    return NextResponse.json({ url: session.url })
  } catch (error) {
    log.error('billing.checkout_failed', { error })
    return NextResponse.json({ error: 'Failed to start checkout' }, { status: 500 })
  }
}
