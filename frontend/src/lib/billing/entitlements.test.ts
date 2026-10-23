import { describe, expect, it } from 'vitest'
import { GRACE_PERIOD_DAYS, resolvePlan } from './entitlements'
import { PLAN_LIMITS } from './plans'
import { validateUpload } from '@/lib/uploads'
import { safeNextPath } from '@/lib/redirects'

const now = new Date('2026-10-09T12:00:00Z')
const sub = (overrides: Partial<Parameters<typeof resolvePlan>[0] & object> = {}) => ({
  plan: 'pro' as const,
  status: 'active',
  current_period_start: '2026-10-01T00:00:00Z',
  current_period_end: '2026-11-01T00:00:00Z',
  cancel_at_period_end: false,
  stripe_customer_id: 'cus_1',
  ...overrides,
})

describe('resolvePlan (subscription checks)', () => {
  it('is free without a subscription', () => {
    expect(resolvePlan(null, now).plan).toBe('free')
    expect(resolvePlan(sub({ plan: 'free', status: null }), now).plan).toBe('free')
  })

  it('is pro while active or trialing', () => {
    expect(resolvePlan(sub(), now).plan).toBe('pro')
    expect(resolvePlan(sub({ status: 'trialing' }), now).plan).toBe('pro')
  })

  it('stays pro until the period ends after cancelling (Stripe keeps it active)', () => {
    expect(resolvePlan(sub({ cancel_at_period_end: true }), now).plan).toBe('pro')
  })

  it('drops to free once cancelled or unpaid', () => {
    for (const status of ['canceled', 'unpaid', 'incomplete', 'incomplete_expired', 'paused']) {
      expect(resolvePlan(sub({ status }), now).plan).toBe('free')
    }
  })

  it(`keeps pro for ${GRACE_PERIOD_DAYS} days after a failed payment`, () => {
    const inGrace = resolvePlan(sub({ status: 'past_due', current_period_start: '2026-10-05T00:00:00Z' }), now)
    expect(inGrace.plan).toBe('pro')
    expect(inGrace.graceUntil?.toISOString()).toBe('2026-10-12T00:00:00.000Z')

    const expired = resolvePlan(sub({ status: 'past_due', current_period_start: '2026-09-25T00:00:00Z' }), now)
    expect(expired).toEqual({ plan: 'free', graceUntil: null })
  })
})

describe('plan limits', () => {
  it('gives Pro more of everything', () => {
    for (const key of ['documents', 'questionsPerMonth', 'maxFileSize'] as const) {
      expect(PLAN_LIMITS.pro[key]).toBeGreaterThan(PLAN_LIMITS.free[key])
    }
  })
})

describe('validateUpload', () => {
  const pdf = { name: 'report.PDF', size: 1000, type: 'application/pdf' }

  it('accepts a PDF within the limit', () => {
    expect(validateUpload(pdf)).toBeNull()
  })

  it('rejects other types, empty files and oversize files', () => {
    expect(validateUpload({ ...pdf, type: 'text/html' })).toMatch(/Only PDF/)
    expect(validateUpload({ ...pdf, name: 'report.pdf.exe' })).toMatch(/Only PDF/)
    expect(validateUpload({ ...pdf, size: 0 })).toMatch(/empty/)
    expect(validateUpload({ ...pdf, size: PLAN_LIMITS.free.maxFileSize + 1 })).toMatch(/10 MB/)
    expect(validateUpload({ ...pdf, size: PLAN_LIMITS.free.maxFileSize + 1 }, PLAN_LIMITS.pro.maxFileSize)).toBeNull()
  })
})

describe('safeNextPath (open redirect protection)', () => {
  it('allows same-site paths', () => {
    expect(safeNextPath('/documents/abc?x=1')).toBe('/documents/abc?x=1')
  })

  it('rejects other sites', () => {
    for (const next of ['https://evil.example', '//evil.example', '/\\evil.example', 'javascript:alert(1)', '', null]) {
      expect(safeNextPath(next)).toBe('/dashboard')
    }
  })
})
