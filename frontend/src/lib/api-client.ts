// Browser-side fetch for our own API. A 401 means the session expired (or was
// revoked) while the page was open: send the user to sign in again and bring
// them back here afterwards.

export class SessionExpiredError extends Error {
  constructor() {
    super('Your session has expired. Redirecting to sign in...')
  }
}

export async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(input, init)
  if (response.status === 401) {
    const next = window.location.pathname + window.location.search
    window.location.href = `/login?error=session&next=${encodeURIComponent(next)}`
    throw new SessionExpiredError()
  }
  return response
}

// Error message from a JSON error response; `upgrade` is set when moving to
// Pro would lift the limit that was hit
export async function readApiError(response: Response, fallback: string): Promise<{ message: string; upgrade: boolean }> {
  const body = await response.json().catch(() => null)
  return { message: body?.error || fallback, upgrade: Boolean(body?.upgrade) }
}
