import { human, minutes } from '../clusters/time'
import { memText } from '../jobs/format'

export const ASK_VS = 'Ask every time'
export const ASK_VS_SUB = 'Shows this window before VS Code starts.'

/** "2 cores · 8G · 1:12:40 of 8:00:00" (squeue) in words: "2 cores · 8 GB · 1 h 13 min of 8 h". */
export function inWords(resources: string): string {
  const m = /^(\d+) cores · (\S+) · (\S+) of (\S+)$/.exec(resources)
  if (!m) return resources
  const time = (t: string) => { const n = minutes(t); return n === null ? t : human(n) }
  return `${m[1]} ${m[1] === '1' ? 'core' : 'cores'} · ${memText(m[2])} · ${time(m[3])} of ${time(m[4])}`
}
