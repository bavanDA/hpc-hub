// Small pieces the Globus parts share: a text field, sizes, paths and the pasted sign-in code.
import type { InputHTMLAttributes } from 'react'

export const HELP = 'Register a free app at app.globus.org → Settings → Developers → Register an app. Choose the ' +
  'one for “native applications that are distributed to users”, name it HPC Hub, and add the redirect ' +
  'https://auth.globus.org/v2/web/auth-code. Paste its Client ID here.'

const REDIRECT = 'https://auth.globus.org/v2/web/auth-code'

export function Field({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} spellCheck={false}
    className={`h-9 min-w-0 rounded-md bg-pill px-3 outline-none placeholder:text-dim focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus ${
      className}`} />
}

/** Like GLib.format_size: 12 bytes, 2.0 kB, 1.5 MB. */
export function formatSize(n: number): string {
  if (n < 1000) return `${n} byte${n === 1 ? '' : 's'}`
  const units = ['kB', 'MB', 'GB', 'TB', 'PB']
  let v = n / 1000, u = 0
  while (v >= 1000 && u < units.length - 1) { v /= 1000; u++ }
  return `${v.toFixed(1)} ${units[u]}`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "2026-10-21 14:02" as Oct 21 14:02, or Oct 21 2025 in another year. */
export function shortDate(when: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}:\d{2})/.exec(when)
  if (!m) return when
  const day = `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}`
  return Number(m[1]) === new Date().getFullYear() ? `${day} ${m[4]}` : `${day} ${m[1]}`
}

export function joinPath(dir: string, name: string): string {
  return `${dir.replace(/\/+$/, '')}/${name}`
}

export function parentPath(path: string): string {
  const trimmed = path.replace(/\/+$/, '')
  return trimmed.slice(0, trimmed.lastIndexOf('/')) || '/'
}

/** The code Globus shows after sign-in, also when the whole page address was pasted (see api.pasted_code). */
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

export const names = (list: string[]) => list.join(' and ')
