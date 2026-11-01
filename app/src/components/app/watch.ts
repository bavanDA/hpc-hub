// Keeps an eye on your work while the app runs: time left on each cluster's compute node (for the sidebar footer),
// and a desktop notification when a node has 15 minutes left, one of your jobs ends, or a copy is done.
// One look at your jobs per connected cluster every minute (jobs.list, the same call as the Jobs page).
import { useEffect, useRef, useSyncExternalStore } from 'react'

import { useEvent } from '../../hooks'
import { call } from '../../rpc'
import type { Transfer } from '../../types/files'
import type { JobList } from '../../types/jobs'
import { useClusters } from '../clusters/store'
import { notify } from './notify'

const EVERY_MS = 60_000
const WARN_SECONDS = 15 * 60
const LIVE = new Set(['RUNNING', 'PENDING', 'CONFIGURING', 'COMPLETING', 'SUSPENDED'])

/** Seconds left on a cluster's node, and when that was measured (Date.now()). */
type Left = { job: string; seconds: number; at: number }

let lefts: Record<string, Left> = {}
const subs = new Set<() => void>()
const publish = (next: Record<string, Left>) => { lefts = next; subs.forEach((fn) => fn()) }

/** Time left on this cluster's node, counting down between looks; null when unknown. */
export function useTimeLeft(cluster: string, job: string): number | null {
  const all = useSyncExternalStore((fn) => { subs.add(fn); return () => subs.delete(fn) }, () => lefts)
  const l = all[cluster]
  if (!l || l.job !== job) return null
  return Math.max(0, l.seconds - Math.floor((Date.now() - l.at) / 1000))
}

export function leftText(seconds: number): string {
  const m = Math.floor(seconds / 60)
  if (m < 60) return `${m} min left`
  const h = Math.floor(m / 60)
  return h < 48 ? `${h} h ${m % 60} min left` : `${Math.floor(h / 24)} days left`
}

export function useWatch() {
  const { clusters, sessions } = useClusters()
  const live = useRef<Record<string, Map<string, string>>>({})  // cluster: your running/waiting jobs, id: name
  const warned = useRef(new Set<string>())
  const copies = useRef(new Map<string, boolean>())  // transfer id: finished
  const names = Object.fromEntries((clusters ?? []).map((c) => [c.id, c.name]))
  const up = Object.values(sessions).filter((s) => s.connected).map((s) => `${s.id}:${s.job ?? ''}`).join(' ')

  useEffect(() => {
    const look = () => {
      for (const item of up.split(' ').filter(Boolean)) {
        const [id, job] = item.split(':')
        call<JobList>('jobs.list', { cluster: id, scope: 'mine' }).then((list) => {
          const name = names[id] ?? id
          const now = new Map(list.jobs.filter((j) => LIVE.has(j.state)).map((j) => [j.job_id, j.name]))
          const before = live.current[id]
          if (before) {
            for (const [jid, jname] of before) {
              if (!now.has(jid)) {
                notify(`${name}: job ${jid} ended`, jname, { kind: 'job', page: 'jobs', params: { cluster: id } })
                  .catch(() => {})
              }
            }
          }
          live.current[id] = now
          const mine = job ? list.jobs.find((j) => j.job_id === job) : undefined
          const next = { ...lefts }
          if (mine && mine.limit_seconds > 0) {
            const seconds = Math.max(0, mine.limit_seconds - mine.seconds)
            next[id] = { job, seconds, at: Date.now() }
            if (seconds <= WARN_SECONDS && !warned.current.has(`${id}:${job}`)) {
              warned.current.add(`${id}:${job}`)
              notify(`${name}: ${leftText(seconds)} on ${mine.where || 'your node'}`,
                'Save your work. The node ends when its time is up.',
                { kind: 'node', page: 'clusters', params: { cluster: id } }).catch(() => {})
            }
          } else {
            delete next[id]
          }
          publish(next)
        }).catch(() => {})
      }
    }
    look()
    const timer = setInterval(look, EVERY_MS)
    return () => clearInterval(timer)
  }, [up])  // eslint-disable-line react-hooks/exhaustive-deps -- names only label the notifications

  useEvent<Transfer>('transfer', (t) => {
    const was = copies.current.get(t.id)
    copies.current.set(t.id, t.finished)
    if (t.finished && was === false) {
      notify(t.error ? 'Copy failed' : 'Copy done', t.error || t.title,
        { kind: 'copy', page: 'files', params: { tab: 'transfers' } }).catch(() => {})
    }
  })
}
