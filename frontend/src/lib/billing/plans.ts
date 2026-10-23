// Plan limits, shared by the browser and the server.
// Keep this file free of server-only imports so client components can use it.

export type Plan = 'free' | 'pro'

export interface PlanLimits {
  documents: number // stored at once
  questionsPerMonth: number // calendar month, UTC
  maxFileSize: number // bytes
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: { documents: 5, questionsPerMonth: 100, maxFileSize: 10 * 1024 * 1024 },
  pro: { documents: 100, questionsPerMonth: 5000, maxFileSize: 25 * 1024 * 1024 },
}

export const PLAN_NAMES: Record<Plan, string> = { free: 'Free', pro: 'Pro' }

// What the settings page and upload UI need to know about the user's account
export interface AccountSummary {
  plan: Plan
  limits: PlanLimits
  usage: { questions: number; documents: number }
  subscription: {
    status: string | null
    currentPeriodEnd: string | null
    cancelAtPeriodEnd: boolean
    // Payment failed but Pro features stay on until this date
    graceUntil: string | null
    hasBillingAccount: boolean
  }
}
