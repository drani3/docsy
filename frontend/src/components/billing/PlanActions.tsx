'use client'

import { useState } from 'react'
import { apiFetch, readApiError } from '@/lib/api-client'
import { showToast } from '@/components/ui/Toast'
import type { Plan } from '@/lib/billing/plans'

// Upgrade (Stripe Checkout) or manage (Stripe Customer Portal). Both hand
// off to Stripe; the plan itself only changes when the webhook arrives.
export default function PlanActions({
  plan,
  hasBillingAccount,
  yearlyAvailable,
}: {
  plan: Plan
  hasBillingAccount: boolean
  yearlyAvailable: boolean
}) {
  const [busy, setBusy] = useState<string | null>(null)

  const go = async (action: string, path: string, body?: object) => {
    setBusy(action)
    try {
      const response = await apiFetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      })
      if (!response.ok) throw new Error((await readApiError(response, 'Something went wrong')).message)
      const { url } = await response.json()
      window.location.href = url
    } catch (error: any) {
      showToast('error', error.message)
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-wrap gap-3">
      {plan === 'free' && (
        <>
          <button
            onClick={() => go('month', '/api/billing/checkout', { interval: 'month' })}
            disabled={busy !== null}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {busy === 'month' ? 'Opening checkout...' : 'Upgrade to Pro'}
          </button>
          {yearlyAvailable && (
            <button
              onClick={() => go('year', '/api/billing/checkout', { interval: 'year' })}
              disabled={busy !== null}
              className="rounded-lg border border-indigo-200 px-4 py-2 text-sm text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
            >
              {busy === 'year' ? 'Opening checkout...' : 'Upgrade yearly'}
            </button>
          )}
        </>
      )}
      {hasBillingAccount && (
        <button
          onClick={() => go('portal', '/api/billing/portal')}
          disabled={busy !== null}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {busy === 'portal' ? 'Opening...' : plan === 'pro' ? 'Manage subscription' : 'Billing history'}
        </button>
      )}
    </div>
  )
}
