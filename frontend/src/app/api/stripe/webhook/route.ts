import type Stripe from 'stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { stripe, syncSubscription } from '@/lib/billing/stripe'
import { requireEnv } from '@/lib/ai/http'
import { log, timer } from '@/lib/log'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST /api/stripe/webhook — the only way a subscription changes.
//
//  1. Verify the signature (rejects forged or replayed requests)
//  2. Skip events already processed (Stripe retries and may send duplicates)
//  3. Re-read the subscription from Stripe and store it (order-independent)
//  4. Record the event id; any failure returns 500 so Stripe retries
export async function POST(request: Request) {
  const elapsed = timer()
  const signature = request.headers.get('stripe-signature')
  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    // The raw body is needed: re-serialised JSON would not match the signature
    const payload = await request.text()
    event = stripe().webhooks.constructEvent(payload, signature, requireEnv('STRIPE_WEBHOOK_SECRET'))
  } catch (error) {
    log.warn('stripe.webhook.invalid_signature', { error })
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: seen } = await admin.from('stripe_events').select('id').eq('id', event.id).maybeSingle()
  if (seen) {
    log.info('stripe.webhook.duplicate', { event_id: event.id, type: event.type })
    return NextResponse.json({ received: true, duplicate: true })
  }

  try {
    const result = await handleEvent(event)

    const { error } = await admin.from('stripe_events').insert({ id: event.id, type: event.type })
    // A concurrent delivery may have recorded it first; processing is idempotent
    if (error && error.code !== '23505') throw new Error(`Failed to record event: ${error.message}`)

    log.info('stripe.webhook.processed', { event_id: event.id, type: event.type, ...result, ms: elapsed() })
    return NextResponse.json({ received: true })
  } catch (error) {
    log.error('stripe.webhook.failed', { event_id: event.id, type: event.type, ms: elapsed(), error })
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}

async function handleEvent(event: Stripe.Event): Promise<Record<string, unknown>> {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object
      if (session.mode !== 'subscription' || !session.subscription) return { skipped: 'not a subscription' }
      const id = typeof session.subscription === 'string' ? session.subscription : session.subscription.id
      return syncSubscription(id)
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
    case 'customer.subscription.paused':
    case 'customer.subscription.resumed':
      return syncSubscription(event.data.object.id)

    // Renewals and failed payments change the period and status
    case 'invoice.paid':
    case 'invoice.payment_succeeded':
    case 'invoice.payment_failed': {
      const invoice = event.data.object
      if (!invoice.subscription) return { skipped: 'not a subscription invoice' }
      const id = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription.id
      const result = await syncSubscription(id)
      if (event.type === 'invoice.payment_failed') {
        log.warn('stripe.payment_failed', { user_id: result.userId, attempt: invoice.attempt_count })
      }
      return result
    }

    default:
      return { skipped: 'unhandled type' }
  }
}
