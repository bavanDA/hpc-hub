// Demo for the monitoring bar under terminals: made-up stats every few seconds, like monitor.watch sends them.
import type { MonitorStats } from '../types/terminals'
import { demoEmit } from './events'

const GB = 1024 ** 3
const timers = new Map<number, number>()
let next = 0

const wobble = (x: number, by: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, x + (Math.random() - 0.5) * 2 * by))

function watch({ node = '' }: { cluster: string; node?: string }): number {
  const id = ++next
  const busy = !!node  // the compute node works hard, so the bar shows its orange and red
  let cpu = busy ? 92 : 18
  let mem = busy ? 0.84 : 0.41
  let uptime = busy ? 3 * 86400 + 7200 : 41 * 86400 + 5 * 3600
  const send = () => {
    cpu = wobble(cpu, 4, busy ? 86 : 5, busy ? 99 : 40)
    mem = wobble(mem, 0.01, 0.3, 0.88)
    uptime += 3
    const total = busy ? 256 * GB : 64 * GB
    const stats: MonitorStats = {
      id, host: node || 'login01', cpu: Math.round(cpu * 10) / 10, mem_used: mem * total, mem_total: total,
      up: Math.random() * (busy ? 40e3 : 300e3), down: Math.random() * (busy ? 9e6 : 2e6), uptime,
      users: busy ? 1 : 57, nets: busy ? ['eth0', 'ib0'] : ['eth0'],
      disks: [{ mount: '/', used: 41 * GB, size: 64 * GB, percent: 64 },
        { mount: '/tmp', used: (busy ? 330 : 40) * GB, size: 400 * GB, percent: busy ? 83 : 10 }],
    }
    demoEmit('monitor', stats)
  }
  setTimeout(send, 200)
  timers.set(id, window.setInterval(send, 3000))
  return id
}

export const answers: Record<string, unknown> = {
  'monitor.watch': watch,
  'monitor.unwatch': ({ id }: { id: number }) => { clearInterval(timers.get(id)); timers.delete(id); return null },
}
