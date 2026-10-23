import { beforeEach, describe, expect, it, vi } from 'vitest'
import Stripe from 'stripe'

const SECRET = 'whsec_test_secret'
process.env.STRIPE_SECRET_KEY = 'sk_test_dummy'
process.env.STRIPE_WEBHOOK_SECRET = SECRET

// In-memory stand-in for the stripe_events table
const processed = new Set<string>()
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: (_: string, id: string) => ({
          maybeSingle: async () => ({ data: processed.has(id) ? { id } : null }),
        }),
      }),
      insert: async ({ id }: { id: string }) => {
        if (processed.has(id)) return { error: { code: '23505', message: 'duplicate' } }
        processed.add(id)
        return { error: null }
      },
    }),
  }),
}))

const syncSubscription = vi.fn(async (id: string) => ({ userId: 'user-1', ignored: false, status: 'active', id }))
vi.mock('@/lib/billing/stripe', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/billing/stripe')>()),
  syncSubscription: (id: string) => syncSubscription(id),
}))

const { POST } = await import('./route')

function signedRequest(event: object, secret = SECRET) {
  const payload = JSON.stringify(event)
  const signature = new Stripe('sk_test_dummy').webhooks.generateTestHeaderString({ payload, secret })
  return new Request('http://localhost/api/stripe/webhook', {
    method: 'POST',
    headers: { 'stripe-signature': signature },
    body: payload,
  })
}

const subscriptionEvent = (id: string) => ({
  id,
  object: 'event',
  type: 'customer.subscription.updated',
  data: { object: { id: 'sub_123', object: 'subscription' } },
})

describe('POST /api/stripe/webhook', () => {
  beforeEach(() => {
    processed.clear()
    syncSubscription.mockClear()
  })

  it('rejects requests without a signature', async () => {
    const response = await POST(new Request('http://localhost/api/stripe/webhook', { method: 'POST', body: '{}' }))
    expect(response.status).toBe(400)
    expect(syncSubscription).not.toHaveBeenCalled()
  })

  it('rejects forged webhooks (signed with the wrong secret)', async () => {
    const response = await POST(signedRequest(subscriptionEvent('evt_forged'), 'whsec_attacker'))
    expect(response.status).toBe(400)
    expect(syncSubscription).not.toHaveBeenCalled()
  })

  it('rejects a tampered body', async () => {
    const request = signedRequest(subscriptionEvent('evt_1'))
    const tampered = new Request(request.url, {
      method: 'POST',
      headers: request.headers,
      body: JSON.stringify({ ...subscriptionEvent('evt_1'), type: 'customer.subscription.deleted' }),
    })
    expect((await POST(tampered)).status).toBe(400)
  })

  it('syncs the subscription from a valid event', async () => {
    const response = await POST(signedRequest(subscriptionEvent('evt_valid')))
    expect(response.status).toBe(200)
    expect(syncSubscription).toHaveBeenCalledWith('sub_123')
    expect(processed.has('evt_valid')).toBe(true)
  })

  it('processes each event once (Stripe retries and duplicates)', async () => {
    await POST(signedRequest(subscriptionEvent('evt_dup')))
    const second = await POST(signedRequest(subscriptionEvent('evt_dup')))
    expect(second.status).toBe(200)
    expect(await second.json()).toMatchObject({ duplicate: true })
    expect(syncSubscription).toHaveBeenCalledTimes(1)
  })

  it('returns 500 so Stripe retries when processing fails, without marking the event done', async () => {
    syncSubscription.mockRejectedValueOnce(new Error('database down'))
    const response = await POST(signedRequest(subscriptionEvent('evt_fail')))
    expect(response.status).toBe(500)
    expect(processed.has('evt_fail')).toBe(false)
  })

  it('syncs the subscription behind a completed checkout', async () => {
    const event = {
      id: 'evt_checkout',
      object: 'event',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_1', object: 'checkout.session', mode: 'subscription', subscription: 'sub_new' } },
    }
    expect((await POST(signedRequest(event))).status).toBe(200)
    expect(syncSubscription).toHaveBeenCalledWith('sub_new')
  })

  it('acknowledges event types it does not handle', async () => {
    const event = { id: 'evt_other', object: 'event', type: 'customer.created', data: { object: { id: 'cus_1' } } }
    expect((await POST(signedRequest(event))).status).toBe(200)
    expect(syncSubscription).not.toHaveBeenCalled()
  })
})
