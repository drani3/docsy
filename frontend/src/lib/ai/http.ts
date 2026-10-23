import 'server-only'

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

interface RetryOptions {
  timeoutMs: number
  maxAttempts?: number
}

const RETRYABLE_STATUS = new Set([408, 409, 429, 500, 502, 503, 504])

// fetch + JSON with a per-attempt timeout and exponential backoff on rate
// limits / server errors (honours Retry-After). Used for OpenAI and Pinecone.
export async function fetchJson<T>(url: string, init: RequestInit, { timeoutMs, maxAttempts = 4 }: RetryOptions): Promise<T> {
  let lastError: Error = new Error('Request failed')

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) })
      const text = await response.text()

      if (response.ok) {
        return (text ? JSON.parse(text) : {}) as T
      }

      const message = extractMessage(text) || response.statusText
      lastError = new ApiError(`${response.status} ${message}`, response.status)

      if (!RETRYABLE_STATUS.has(response.status) || attempt === maxAttempts) {
        throw lastError
      }

      const retryAfter = Number(response.headers.get('retry-after'))
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : backoff(attempt))
    } catch (error: any) {
      if (error instanceof ApiError) throw error
      // Network error or timeout: retry
      lastError = error?.name === 'TimeoutError' ? new Error(`Request timed out after ${timeoutMs}ms`) : error
      if (attempt === maxAttempts) throw lastError
      await sleep(backoff(attempt))
    }
  }

  throw lastError
}

// Like fetchJson, but returns the response once headers arrive so the body can
// be streamed. Retries only happen before that point; `timeoutMs` covers
// connecting only. `signal` aborts the request at any time (e.g. the user
// pressed Stop).
export async function fetchStream(
  url: string,
  init: RequestInit,
  { timeoutMs, maxAttempts = 2, signal }: RetryOptions & { signal?: AbortSignal }
): Promise<Response> {
  let lastError: Error = new Error('Request failed')

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController()
    const abort = () => controller.abort(signal?.reason)
    if (signal?.aborted) throw signal.reason ?? new Error('Aborted')
    signal?.addEventListener('abort', abort, { once: true })
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, timeoutMs)

    try {
      const response = await fetch(url, { ...init, signal: controller.signal })
      clearTimeout(timer)

      if (response.ok && response.body) {
        // Keep forwarding aborts while the caller reads the body
        return response
      }
      signal?.removeEventListener('abort', abort)

      const text = await response.text()
      lastError = new ApiError(`${response.status} ${extractMessage(text) || response.statusText}`, response.status)
      if (!RETRYABLE_STATUS.has(response.status) || attempt === maxAttempts) throw lastError

      const retryAfter = Number(response.headers.get('retry-after'))
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : backoff(attempt))
    } catch (error: any) {
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      if (error instanceof ApiError) throw error
      if (signal?.aborted) throw error
      lastError = timedOut ? new Error(`Request timed out after ${timeoutMs}ms`) : error
      if (attempt === maxAttempts) throw lastError
      await sleep(backoff(attempt))
    }
  }

  throw lastError
}

function backoff(attempt: number) {
  return Math.min(500 * 2 ** (attempt - 1), 8000) + Math.random() * 250
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function extractMessage(text: string): string | null {
  try {
    const body = JSON.parse(text)
    return body?.error?.message || body?.message || null
  } catch {
    return text.slice(0, 200) || null
  }
}

export function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set`)
  return value
}
