// Small pieces of the History tab: times as people say them, initials, counts, and the calls to the cluster.
import './history.css'

import { useEffect, useState, type ReactNode } from 'react'

import { useEvent } from '../../../hooks'
import { call } from '../../../rpc'
import type { GitJob } from '../../../types/history'

export type Where = { cluster: string; folder: string }

export const git = <T,>(method: string, where: Where, params: Record<string, unknown> = {}) =>
  call<T>(`latex.git_${method}`, { ...where, ...params })

export const lastLine = (s: string) => s.trim().split('\n').pop() ?? s
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
export const shortHash = (h: string) => h.slice(0, 7)
export const fileName = (p: string) => p.split('/').pop() ?? p

/** jdoe -> JD, asmith -> AS, mygroup -> MG, Jane Doe -> JD. */
export function initials(name: string): string {
  const words = name.trim().split(/[\s._-]+/).filter(Boolean)
  if (words.length > 1) return (words[0][0] + words[1][0]).toUpperCase()
  const w = words[0] ?? '?'
  const rest = w.slice(1).replace(/^[aeiouy]+/i, '')
  return (w[0] + (rest[0] ?? '')).toUpperCase()
}

const time = (d: Date) => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
const day = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()

/** 2 min ago, 3 hours ago, Yesterday, 16:40, Oct 31, Oct 31 2024. */
export function when(ts: number, long = false): string {
  const d = new Date(ts * 1000), now = new Date(), s = (now.getTime() - d.getTime()) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (sameDay(d, now) && s < 6 * 3600) return `${Math.floor(s / 3600)} ${Math.floor(s / 3600) === 1 ? 'hour' : 'hours'} ago`
  if (sameDay(d, now)) return long ? `today ${time(d)}` : time(d)
  const y = new Date(now)
  y.setDate(y.getDate() - 1)
  if (sameDay(d, y)) return long ? `Yesterday, ${time(d)}` : 'Yesterday'
  return d.getFullYear() === now.getFullYear() ? day(d) : `${day(d)} ${d.getFullYear()}`
}

/** Tue Nov 3 at 11:12 */
export function fullDate(ts: number): string {
  const d = new Date(ts * 1000)
  return `${d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} at ${time(d)}`
}

export const clock = (ts: number) => time(new Date(ts * 1000))

/** Today, Yesterday, October, March 2025: the list's group headings. */
export function group(ts: number): string {
  const d = new Date(ts * 1000), now = new Date()
  if (sameDay(d, now)) return 'Today'
  const y = new Date(now)
  y.setDate(y.getDate() - 1)
  if (sameDay(d, y)) return 'Yesterday'
  const month = d.toLocaleDateString('en-US', { month: 'long' })
  return d.getFullYear() === now.getFullYear() ? month : `${month} ${d.getFullYear()}`
}

export function Avatar({ name, size = 22, faint = false }: { name: string; size?: number; faint?: boolean }) {
  return (
    <span style={{ width: size, height: size, fontSize: size * 0.42 }} title={name}
      className={`grid shrink-0 place-items-center rounded-full border border-line-strong font-semibold
        ${faint ? 'text-faint' : 'text-dim'}`}>{initials(name)}</span>
  )
}

/** +7 −0 in green and red. */
export function Counts({ added, removed, className = '' }: { added: number; removed: number; className?: string }) {
  return (
    <span className={`shrink-0 font-mono text-xs tabular-nums ${className}`}>
      <span className="diff-add-ink">+{added}</span> <span className="diff-del-ink">−{removed}</span></span>
  )
}

/** A two or three way switch, like LaTeX | PDF. */
export function Segments<T extends string>({ value, options, onChange, small = false }:
  { value: T; options: [T, ReactNode][]; onChange: (v: T) => void; small?: boolean }) {
  return (
    <div role="radiogroup" className="flex shrink-0 gap-[2px] rounded-lg bg-pill p-[2px]">
      {options.map(([v, label]) => (
        <button key={v} role="radio" aria-checked={value === v} onClick={() => onChange(v)}
          className={`rounded-md px-2.5 ${small ? 'h-6 text-xs' : 'h-7 text-sm'} ${value === v
            ? 'bg-window font-semibold text-text shadow-sm' : 'text-dim hover:text-text'}`}>{label}</button>
      ))}
    </div>
  )
}

/** Steps of a switch or a push, as `latex-git` events for one job id. */
export function useJob(id: string | null, onEnd: (j: GitJob) => void): GitJob | null {
  const [job, setJob] = useState<GitJob | null>(null)
  useEffect(() => { setJob(null) }, [id])
  useEvent<GitJob>('latex-git', (j) => {
    if (!id || j.id !== id) return
    setJob(j)
    if (j.done) onEnd(j)
  })
  return job
}

/** Seconds counting up while something runs. */
export function useSeconds(running: boolean): number {
  const [s, setS] = useState(0)
  useEffect(() => {
    if (!running) { setS(0); return }
    const t0 = Date.now()
    const t = setInterval(() => setS(Math.floor((Date.now() - t0) / 1000)), 500)
    return () => clearInterval(t)
  }, [running])
  return s
}
