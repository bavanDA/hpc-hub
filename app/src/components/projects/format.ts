import type { Project } from '../../types/projects'
import { shortName } from '../clusters/loginCopy'

export type SortKey = 'name' | 'cluster' | 'opened'
export type Sort = { key: SortKey; desc: boolean }

export const clusterOf = (p: Project) => p.cluster_name ? shortName({ name: p.cluster_name }) : p.cluster

export function sortProjects(list: Project[], { key, desc }: Sort) {
  const by = (p: Project) => key === 'opened' ? p.opened : (key === 'name' ? p.name : clusterOf(p)).toLowerCase()
  return [...list].sort((a, b) => {
    const x = by(a), y = by(b)
    const n = x < y ? -1 : x > y ? 1 : b.opened - a.opened
    return desc ? -n : n
  })
}

/** 10 min ago, 2 h ago, Yesterday, Oct 30, Oct 30 2025. Nothing when never opened. */
export function openedText(ts: number) {
  if (!ts) return ''
  const t = new Date(ts * 1000), now = new Date()
  const min = (now.getTime() - t.getTime()) / 60000
  if (min < 1) return 'Just now'
  if (min < 60) return `${Math.floor(min)} min ago`
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((day(now) - day(t)) / 86400000)
  if (days === 0) return `${Math.floor(min / 60)} h ago`
  if (days === 1) return 'Yesterday'
  const date = t.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return t.getFullYear() === now.getFullYear() ? date : `${date} ${t.getFullYear()}`
}
