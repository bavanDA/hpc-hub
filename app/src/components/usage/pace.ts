import type { Allocation } from '../../types/usage'
import { n } from './format'

/** '2027-03-13' -> 'Mar 13' (with the year: 'Mar 13, 2027'). */
export function day(iso: string, year = false): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US',
    { month: 'short', day: 'numeric', ...(year ? { year: 'numeric' } : {}) })
}

const money = (v: number, cents = false) => `$${n(v, cents ? 2 : 0)}`

/** The big number and what it is. */
export function headline(a: Allocation): [string, string] {
  if (a.quota > 0) return [n(Math.max(0, a.quota - a.used)), 'SUs left']
  const span = /^FY/i.test(a.period) ? 'this fiscal year' : a.period ? `in ${a.period}` : 'so far'
  if (a.rate > 0) return [money(a.used * a.rate, true), span]
  return [n(a.used), `SUs used ${span}`]
}

/** One line about the pace; bold first when time is short. */
export function paceLine(a: Allocation): { bold?: string; text: string } {
  if (a.quota > 0) {
    const used = `${n(a.used)} of ${n(a.quota)} used.`
    if (a.used >= a.quota) return { text: `${used} Nothing left to run on.` }
    if (a.per_day == null) return { text: `${used} The pace is not known on this cluster.` }
    if (!a.per_day || a.days_left == null) return { text: `${used} Nothing billed in the last 4 weeks.` }
    if (a.end && a.runs_out > a.end) return { text: `${used} At this pace it lasts past the end date.` }
    if (a.days_left < 1) return { bold: 'Less than a day left', text: ' at the pace of the last month.' }
    if (a.days_left < 45) {
      const d = Math.round(a.days_left)
      return { bold: `About ${d} day${d === 1 ? '' : 's'} left`, text: ' at the pace of the last month.' }
    }
    if (a.days_left > 365) return { text: `${used} Plenty for the year at this pace.` }
    return { text: `${used} At this pace it runs out around ${day(a.runs_out)}.` }
  }
  const span = a.period ? ` in ${a.period}` : ''
  if (a.rate > 0) {
    const base = `${n(a.used)} SUs${span} at $${a.rate} each.`
    return { text: a.per_day != null ? `${base} About ${money(a.per_day * 30 * a.rate)} a month lately.` : base }
  }
  const base = `${n(a.used)} SUs used${span}, no limit set.`
  return { text: a.per_day != null ? `${base} About ${n(a.per_day * 7)} a week lately.` : base }
}

/** The red tag, '' for none. */
export const tag = (a: Allocation) => (!a.near ? '' : a.quota > 0 && a.used >= a.quota ? 'Used up' : 'Near the limit')

/** Least time left first: used up, then by days left; unknown pace, idle and no limit last. */
export function timeLeft(a: Allocation): number {
  if (a.quota <= 0) return 1e9
  if (a.used >= a.quota) return -1
  return a.days_left ?? (a.per_day === 0 ? 1e8 : 1e7)
}

/** You, who used most of the last 12 weeks when it is someone else and most of it, and when the period ends. */
export function footer(a: Allocation, me: string): string {
  const parts = [a.quota <= 0 && a.rate > 0 ? `You used ${n(a.mine)} SUs, about ${money(a.mine * a.rate)}`
    : `You used ${n(a.mine)}`]
  const people = Object.entries(a.people)
  const total = people.reduce((s, [, v]) => s + v, 0)
  const [top, sus] = people.reduce((b, p) => (p[1] > b[1] ? p : b), ['', 0])
  if (top && top !== me && total > 0 && sus / total >= 0.5) {
    parts.push(`${top} used ${Math.round((100 * sus) / total)}% lately`)
  }
  if (a.end) parts.push(`ends ${day(a.end, true)}`)
  return parts.join(' · ')
}

/** The 12 weeks' last days, oldest first: week i ends (11 - i) weeks before today. */
export function weekEnds(count = 12, today = new Date()): Date[] {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    d.setDate(d.getDate() - (count - 1 - i) * 7)
    return d
  })
}
