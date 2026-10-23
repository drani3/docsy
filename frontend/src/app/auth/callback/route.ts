import { createClient } from '@/lib/supabase/server'
import { safeNextPath } from '@/lib/redirects'
import { log } from '@/lib/log'
import { NextResponse } from 'next/server'

// OAuth (Google) and email-confirmation links land here with a one-time code.
// Failures go back to the login page with a message instead of a dead end.
export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const next = safeNextPath(requestUrl.searchParams.get('next'))

  const fail = (reason: string) => {
    const login = new URL('/login', requestUrl.origin)
    login.searchParams.set('error', reason)
    return NextResponse.redirect(login)
  }

  // The provider reports errors such as the user cancelling consent
  const providerError = requestUrl.searchParams.get('error')
  if (providerError) {
    log.warn('auth.callback.provider_error', {
      error: providerError,
      description: requestUrl.searchParams.get('error_description'),
    })
    return fail(providerError === 'access_denied' ? 'cancelled' : 'provider')
  }

  if (!code) {
    return fail('missing_code')
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    log.warn('auth.callback.exchange_failed', { error: error.message })
    return fail('expired')
  }

  return NextResponse.redirect(new URL(next, requestUrl.origin))
}
