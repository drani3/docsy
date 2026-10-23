import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AppLayout from '@/components/layout/AppLayout'
import UsageMeter from '@/components/billing/UsageMeter'
import PlanActions from '@/components/billing/PlanActions'
import { getAccountSummary } from '@/lib/billing/entitlements'
import { isStripeConfigured, proPriceId } from '@/lib/billing/stripe'
import { PLAN_LIMITS, PLAN_NAMES } from '@/lib/billing/plans'
import { formatFileSize } from '@/lib/uploads'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

export default async function SettingsPage({ searchParams }: { searchParams: { checkout?: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const account = await getAccountSummary(user.id)
  const { plan, limits, usage, subscription } = account
  const resetsOn = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 1)).toISOString()

  return (
    <AppLayout>
      <div className="mb-8">
        <h2 className="text-2xl font-bold">Settings</h2>
        <p className="text-gray-600">Manage your account and plan</p>
      </div>

      {searchParams.checkout === 'success' && plan === 'free' && (
        <div className="mb-6 rounded-lg bg-green-50 p-4 text-sm text-green-800">
          Payment received. Your Pro plan activates as soon as Stripe confirms it, usually within a few seconds.
          Refresh this page if it still shows Free.
        </div>
      )}
      {searchParams.checkout === 'success' && plan === 'pro' && (
        <div className="mb-6 rounded-lg bg-green-50 p-4 text-sm text-green-800">Welcome to Pro! Your new limits are active.</div>
      )}
      {searchParams.checkout === 'cancelled' && (
        <div className="mb-6 rounded-lg bg-gray-100 p-4 text-sm text-gray-700">Checkout was cancelled. You have not been charged.</div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg bg-white p-6 shadow">
          <h3 className="font-medium text-gray-900">Plan</h3>
          <p className="mt-2 text-2xl font-semibold">{PLAN_NAMES[plan]}</p>

          {subscription.graceUntil && (
            <p className="mt-2 rounded-md bg-amber-50 p-3 text-sm text-amber-800">
              Your last payment failed. Update your payment method by {formatDate(subscription.graceUntil)} to keep Pro.
            </p>
          )}
          {plan === 'pro' && subscription.cancelAtPeriodEnd && subscription.currentPeriodEnd && (
            <p className="mt-2 text-sm text-gray-600">
              Cancelled. Pro stays active until {formatDate(subscription.currentPeriodEnd)}, then you move to Free.
            </p>
          )}
          {plan === 'pro' && !subscription.cancelAtPeriodEnd && subscription.currentPeriodEnd && !subscription.graceUntil && (
            <p className="mt-2 text-sm text-gray-600">Renews on {formatDate(subscription.currentPeriodEnd)}.</p>
          )}

          <ul className="mt-4 space-y-1 text-sm text-gray-600">
            <li>{limits.documents} documents</li>
            <li>{limits.questionsPerMonth.toLocaleString('en-US')} questions per month</li>
            <li>PDFs up to {formatFileSize(limits.maxFileSize)}</li>
          </ul>

          {plan === 'free' && (
            <p className="mt-4 text-sm text-gray-600">
              Pro: {PLAN_LIMITS.pro.documents} documents, {PLAN_LIMITS.pro.questionsPerMonth.toLocaleString('en-US')}{' '}
              questions per month, PDFs up to {formatFileSize(PLAN_LIMITS.pro.maxFileSize)}.
            </p>
          )}

          <div className="mt-6">
            {isStripeConfigured() ? (
              <PlanActions
                plan={plan}
                hasBillingAccount={subscription.hasBillingAccount}
                yearlyAvailable={Boolean(proPriceId('year'))}
              />
            ) : (
              <p className="text-sm text-gray-500">Billing is not set up yet.</p>
            )}
          </div>
        </section>

        <section className="rounded-lg bg-white p-6 shadow">
          <h3 className="font-medium text-gray-900">Usage</h3>
          <div className="mt-4 space-y-5">
            <UsageMeter
              label="Questions this month"
              used={usage.questions}
              limit={limits.questionsPerMonth}
              hint={`Resets on ${formatDate(resetsOn)}`}
            />
            <UsageMeter label="Documents" used={usage.documents} limit={limits.documents} hint="Delete a document to free a slot" />
          </div>
        </section>

        <section className="rounded-lg bg-white p-6 shadow lg:col-span-2">
          <h3 className="font-medium text-gray-900">Account</h3>
          <dl className="mt-4 space-y-3 text-sm">
            <div>
              <dt className="text-gray-500">Email</dt>
              <dd className="mt-0.5 text-gray-900">{user.email}</dd>
            </div>
          </dl>
        </section>
      </div>
    </AppLayout>
  )
}
