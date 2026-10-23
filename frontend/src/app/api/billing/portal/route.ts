import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isStripeConfigured, stripe } from '@/lib/billing/stripe'
import { rateLimit } from '@/lib/rate-limit'
import { log } from '@/lib/log'
import { NextResponse } from 'next/server'

// POST /api/billing/portal → { url }
// Stripe's Customer Portal: change card, see invoices, cancel or resume.
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

    const { data: subscription } = await createAdminClient()
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!subscription?.stripe_customer_id) {
      return NextResponse.json({ error: 'No billing account yet. Upgrade to Pro first.' }, { status: 404 })
    }

    const session = await stripe().billingPortal.sessions.create({
      customer: subscription.stripe_customer_id,
      return_url: `${new URL(request.url).origin}/settings`,
    })

    return NextResponse.json({ url: session.url })
  } catch (error) {
    log.error('billing.portal_failed', { error })
    return NextResponse.json({ error: 'Failed to open the billing portal' }, { status: 500 })
  }
}
