import { ArrowDown, ArrowUp, Clock, Cpu, HardDrive, MemoryStick, Server, Users } from 'lucide-react'

import { useEnabled } from './monitorBarSetting'
import { duration, level, rate, size, usedOf } from './monitorFormat'
import { MonitorItem } from './MonitorItem'
import { useStats } from './useStats'

export function MonitorBar({ cluster, node, shown }: { cluster: string; node: string; shown: boolean }) {
  const on = useEnabled()
  const st = useStats(cluster, node, shown && on)
  if (!on) return null
  const host = st?.host ?? (node || 'login node')
  const mem = st && st.mem_total ? (100 * st.mem_used) / st.mem_total : null
  const nets = st?.nets.length ? ` (${st.nets.join(', ')})` : ''
  return (
    <div className="flex h-6 shrink-0 items-center gap-3.5 overflow-hidden border-t border-line bg-view px-2.5
      font-mono text-xs whitespace-nowrap text-dim tabular-nums">
      <MonitorItem icon={Server} text={host} tip={`${host}: the whole machine, all users. Not just this terminal.`} />
      <MonitorItem icon={Cpu} text={st?.cpu == null ? '...' : `${Math.round(st.cpu)}%`} level={level(st?.cpu ?? null)}
        tip={st?.cpu == null ? 'CPU: waiting for a second sample'
          : `CPU: ${st.cpu.toFixed(1)}% of all cores in use, by everyone on ${host}`} />
      <MonitorItem icon={MemoryStick} text={st ? usedOf(st.mem_used, st.mem_total) : '...'} level={level(mem)}
        tip={st ? `Memory: ${size(st.mem_used)} of ${size(st.mem_total)} in use${
          mem === null ? '' : ` (${Math.round(mem)}%)`}` : 'Memory'} />
      <MonitorItem icon={ArrowUp} text={rate(st?.up ?? null)} tip={`Upload: ${rate(st?.up ?? null)}${nets}`} />
      <MonitorItem icon={ArrowDown} text={rate(st?.down ?? null)} tip={`Download: ${rate(st?.down ?? null)}${nets}`} />
      <MonitorItem icon={Clock} text={st ? duration(st.uptime) : '...'} tip={st ? `Up for ${duration(st.uptime)}` : 'Uptime'} />
      <MonitorItem icon={Users} text={st ? String(st.users) : '...'}
        tip={st ? `${st.users} ${st.users === 1 ? 'person' : 'people'} signed in` : 'People signed in'} />
      {st?.disks.map((d) => (
        <MonitorItem key={d.mount} icon={HardDrive} text={`${d.mount}: ${d.percent}%`} level={level(d.percent)}
          tip={`Disk ${d.mount}: ${size(d.used)} of ${size(d.size)} used`} />
      ))}
    </div>
  )
}
