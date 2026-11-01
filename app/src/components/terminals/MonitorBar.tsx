// The monitoring bar under a session's terminal, like MobaXterm's (hpc_hub/terminals/monitor.py): host, CPU,
// memory, network, uptime, users and disks of the host the session runs on. It watches only while shown.
import { ArrowDown, ArrowUp, Clock, Cpu, HardDrive, MemoryStick, Server, Users, type LucideIcon } from 'lucide-react'
import { useEffect, useState, useSyncExternalStore } from 'react'

import { call, on } from '../../rpc'
import type { MonitorStats } from '../../types/terminals'

// Settings: Monitoring bar. Read once, then kept up to date by the Settings dialog.
let enabled = true
const subscribers = new Set<() => void>()
export const setMonitorBar = (shown: boolean) => { enabled = shown; subscribers.forEach((fn) => fn()) }
call<{ monitor_bar: boolean }>('preferences.get').then((p) => setMonitorBar(p.monitor_bar)).catch(() => {})
const useEnabled = () =>
  useSyncExternalStore((fn) => { subscribers.add(fn); return () => subscribers.delete(fn) }, () => enabled)

// The same as monitor.py's size, rate, duration, level and used_of
const UNITS = ['B', 'KB', 'MB', 'GB', 'TB']

function size(n: number): string {
  let i = 0
  while (n >= 1024 && i < UNITS.length - 1) { n /= 1024; i++ }
  return `${i === 0 || n >= 100 ? n.toFixed(0) : n.toFixed(1)} ${UNITS[i]}`
}

const rate = (n: number | null) => (n === null ? '...' : `${size(n)}/s`)

function duration(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  return days ? `${days}d ${hours}h` : `${hours}h ${Math.floor((seconds % 3600) / 60)}m`
}

type Level = '' | 'warn' | 'high'
const level = (percent: number | null): Level => (percent === null || percent < 80 ? '' : percent < 90 ? 'warn' : 'high')

function usedOf(used: number, total: number): string {
  const [a, unitA] = size(used).split(' ')
  const b = size(total)
  return unitA === b.split(' ')[1] ? `${a} / ${b}` : `${size(used)} / ${b}`
}

/** The host's stats while active; the last ones stay while hidden. */
function useStats(cluster: string, node: string, active: boolean): MonitorStats | null {
  const [stats, setStats] = useState<MonitorStats | null>(null)
  useEffect(() => {
    if (!active) return
    let id: number | null = null
    let stopped = false
    let early: MonitorStats | null = null  // the last stats can come before monitor.watch answers with the id
    const off = on('monitor', (d) => {
      const s = d as MonitorStats
      if (id === null) early = s
      else if (s.id === id) setStats(s)
    })
    call<number>('monitor.watch', { cluster, node }).then((w) => {
      if (stopped) return void call('monitor.unwatch', { id: w }).catch(() => {})
      id = w
      if (early?.id === w) setStats(early)
    }).catch(() => {})  // not connected: the bar waits with dots
    return () => {
      stopped = true
      off()
      if (id !== null) call('monitor.unwatch', { id }).catch(() => {})
    }
  }, [cluster, node, active])
  return stats
}

const COLORS: Record<Level, string> = { '': '', warn: 'text-orange', high: 'font-bold text-bad' }

function Item({ icon: Icon, text, tip, level = '' }: { icon: LucideIcon; text: string; tip: string; level?: Level }) {
  return (
    <span title={tip} className={`flex shrink-0 items-center gap-1 ${COLORS[level]}`}>
      <Icon size={12} strokeWidth={2.25} className="shrink-0 opacity-80" />
      {text}
    </span>
  )
}

export function MonitorBar({ cluster, node, shown }: { cluster: string; node: string; shown: boolean }) {
  const on = useEnabled()
  const st = useStats(cluster, node, shown && on)
  if (!on) return null
  const host = st?.host ?? (node || 'login node')
  const mem = st && st.mem_total ? (100 * st.mem_used) / st.mem_total : null
  const nets = st?.nets.length ? ` (${st.nets.join(', ')})` : ''
  return (
    <div className="flex h-6 shrink-0 items-center gap-3.5 overflow-hidden border-t border-line bg-view px-2.5
      font-mono text-[11px] whitespace-nowrap text-dim tabular-nums">
      <Item icon={Server} text={host} tip={`Host: ${host}`} />
      <Item icon={Cpu} text={st?.cpu == null ? '...' : `${Math.round(st.cpu)}%`} level={level(st?.cpu ?? null)}
        tip={st?.cpu == null ? 'CPU: waiting for a second sample' : `CPU: ${st.cpu.toFixed(1)}% of all cores in use`} />
      <Item icon={MemoryStick} text={st ? usedOf(st.mem_used, st.mem_total) : '...'} level={level(mem)}
        tip={st ? `Memory: ${size(st.mem_used)} of ${size(st.mem_total)} in use${
          mem === null ? '' : ` (${Math.round(mem)}%)`}` : 'Memory'} />
      <Item icon={ArrowUp} text={rate(st?.up ?? null)} tip={`Upload: ${rate(st?.up ?? null)}${nets}`} />
      <Item icon={ArrowDown} text={rate(st?.down ?? null)} tip={`Download: ${rate(st?.down ?? null)}${nets}`} />
      <Item icon={Clock} text={st ? duration(st.uptime) : '...'} tip={st ? `Up for ${duration(st.uptime)}` : 'Uptime'} />
      <Item icon={Users} text={st ? String(st.users) : '...'}
        tip={st ? `${st.users} ${st.users === 1 ? 'person' : 'people'} logged in` : 'People logged in'} />
      {st?.disks.map((d) => (
        <Item key={d.mount} icon={HardDrive} text={`${d.mount}: ${d.percent}%`} level={level(d.percent)}
          tip={`Disk ${d.mount}: ${size(d.used)} of ${size(d.size)} used`} />
      ))}
    </div>
  )
}
