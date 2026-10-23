import { createClient } from '@/lib/supabase/server'
import { getAccountSummary } from '@/lib/billing/entitlements'
import { log } from '@/lib/log'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// GET /api/billing/account → AccountSummary (plan, limits, this month's usage)
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    return NextResponse.json(await getAccountSummary(user.id))
  } catch (error) {
    log.error('billing.account_failed', { error })
    return NextResponse.json({ error: 'Failed to load account' }, { status: 500 })
  }
}
