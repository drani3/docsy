import 'server-only'
import { headers } from 'next/headers'

// Structured logs: one JSON object per line, so Vercel's log search (or any
// log drain) can filter on fields. Never pass document text or answers here.

type Level = 'info' | 'warn' | 'error'
type Fields = Record<string, unknown>

// Set by middleware on every request; ties together all logs of one request
export function requestId(): string | undefined {
  try {
    return headers().get('x-request-id') ?? undefined
  } catch {
    return undefined // outside a request (scripts, tests)
  }
}

function write(level: Level, event: string, fields: Fields = {}) {
  const entry = {
    level,
    event,
    time: new Date().toISOString(),
    request_id: fields.request_id ?? requestId(),
    ...fields,
  }
  const line = JSON.stringify(entry, (_, value) => (value instanceof Error ? value.message : value))
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.info(line)
}

export const log = {
  info: (event: string, fields?: Fields) => write('info', event, fields),
  warn: (event: string, fields?: Fields) => write('warn', event, fields),
  error: (event: string, fields?: Fields) => write('error', event, fields),
}

// Times an async step: `const ms = timer(); ...; ms()`
export function timer() {
  const start = performance.now()
  return () => Math.round(performance.now() - start)
}
