export const HELP = 'Register a free app at app.globus.org → Settings → Developers → Register an app. Choose the ' +
  'one for “native applications that are distributed to users”, name it HPC Hub, and add the redirect ' +
  'https://auth.globus.org/v2/web/auth-code. Paste its Client ID here.'

const REDIRECT = 'https://auth.globus.org/v2/web/auth-code'
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "2026-10-21 14:02" as Oct 21 14:02, or Oct 21 2025 in another year. */
export function shortDate(when: string, now = new Date()): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}:\d{2})/.exec(when)
  if (!m) return when
  const day = `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}`
  return Number(m[1]) === now.getFullYear() ? `${day} ${m[4]}` : `${day} ${m[1]}`
}

/** The code Globus shows after sign-in, also when the whole page address was pasted. */
export function pastedCode(text: string): string {
  const t = text.trim()
  if (t.startsWith(REDIRECT)) {
    try { return new URL(t).searchParams.get('code') ?? '' } catch { return '' }
  }
  return /^[A-Za-z0-9_-]{8,200}$/.test(t) ? t : ''
}

/** Clipboard text that is probably a code (long enough not to be some other copied word). */
export function looksLikeCode(text: string): boolean {
  const code = pastedCode(text)
  return !!code && (code.length >= 20 || code !== text.trim())
}
