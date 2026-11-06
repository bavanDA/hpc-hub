import { sessionKind, type TmuxSession } from '../../../types/terminals'
import { inside, tilde } from './paths'

function ago(ts: number, now: number): string {
  if (!ts) return ''
  const m = Math.floor(Math.max(0, now / 1000 - ts) / 60)
  return m < 60 ? `${m} min` : m < 48 * 60 ? `${Math.floor(m / 60)} h` : `${Math.floor(m / 1440)} days`
}

/** What runs in it, where, and since when: "python · n0042 · src · 3 h". */
export function about(s: TmuxSession, folder: string, home: string, now = Date.now()): string {
  const what = sessionKind(s)
  const dir = !s.path ? '' : inside(s.path, folder) ? s.path.slice(folder.length + 1) : tilde(s.path, home)
  return [what, s.node || 'login node', dir, ago(s.created, now)].filter(Boolean).join(' · ')
}
