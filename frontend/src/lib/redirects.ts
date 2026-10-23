// Only same-site paths are allowed as a post-login destination, so a crafted
// link like /login?next=https://evil.example can't redirect off the site.
export function safeNextPath(next: string | null | undefined, fallback = '/dashboard'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return fallback
  return next
}
