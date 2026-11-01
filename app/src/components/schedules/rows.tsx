// Rows of the schedule dialog: the days to run on, how long a run may take, and the compute it asks for.
import type { Limits, Profile } from '../../types/clusters'
import type { Compute } from '../../types/schedules'
import { ActionRow, EntryRow, SpinRow } from '../clusters/fields'
import { human } from '../clusters/time'

export function DaysRow({ names, days, onChange }: { names: string[]; days: number[]; onChange: (d: number[]) => void }) {
  const flip = (d: number) => onChange(days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort())
  return (
    <ActionRow label="Days" sub="None picked means every day">
      <div className="flex overflow-hidden rounded-md">
        {names.map((n, i) => (
          <button key={n} type="button" aria-pressed={days.includes(i + 1)} title={n} onClick={() => flip(i + 1)}
            className={`h-9 w-10 text-[14px] font-bold transition ${i ? 'border-l border-line' : ''} ${
              days.includes(i + 1) ? 'bg-accent text-white' : 'bg-pill hover:bg-selected'}`}>{n.slice(0, 2)}</button>
        ))}
      </div>
    </ActionRow>
  )
}

/** Days, hours and minutes, never more than the partition and QoS allow. */
export function DurationRow({ total, limits, onChange }:
  { total: number; limits: Limits | null; onChange: (m: number) => void }) {
  const d = Math.floor(total / 1440), h = Math.floor((total % 1440) / 60), m = total % 60
  const top = limits?.longest ?? null
  const set = (dd: number, hh: number, mm: number) => {
    const t = Math.max(1, dd * 1440 + hh * 60 + mm)
    onChange(top ? Math.min(t, top) : t)
  }
  const sub = !limits?.known ? 'Max shown after you connect'
    : top ? `Longest allowed: ${human(top)} (${limits.why})` : 'No time limit here'
  const units: [string, string, number, number, (v: number) => void][] = [
    ['days', 'd', d, 99, (v) => set(v, h, m)], ['hours', 'h', h, 23, (v) => set(d, v, m)],
    ['minutes', 'min', m, 59, (v) => set(d, h, v)]]
  return (
    <ActionRow label="Time each run may take" sub={sub}>
      <div className="flex items-center gap-1.5">
        {units.map(([label, unit, value, max, change]) => (
          <label key={unit} className="flex items-center gap-1.5">
            <input aria-label={label} type="number" min={0} max={max} value={value}
              onChange={(e) => change(Math.min(max, Math.max(0, parseInt(e.target.value || '0', 10) || 0)))}
              className="h-8 w-14 rounded-md bg-pill pl-2 text-center tabular-nums outline-none focus:ring-2
                focus:ring-accent" />
            <span className="mr-1.5 text-dim">{unit}</span>
          </label>
        ))}
      </div>
    </ActionRow>
  )
}

export type OwnCompute = Required<Compute>

export const ownFrom = (p: Profile, c: Compute): OwnCompute => ({ cpus: c.cpus ?? p.cpus, mem_gb: c.mem_gb ?? p.mem_gb,
  gpus: c.gpus ?? p.gpus ?? 0, partition: c.partition ?? p.partition, account: c.account ?? p.account ?? '',
  qos: c.qos ?? p.qos ?? '' })

export function ComputeRows({ value, limits, onChange }:
  { value: OwnCompute; limits: Limits | null; onChange: (c: OwnCompute) => void }) {
  const set = (part: Partial<OwnCompute>) => onChange({ ...value, ...part })
  return (
    <>
      <SpinRow label="CPU cores" value={value.cpus} onChange={(cpus) => set({ cpus })} min={1} max={512} />
      <SpinRow label="Memory (GB)" value={value.mem_gb} onChange={(mem_gb) => set({ mem_gb })} min={1} max={4096} />
      <SpinRow label="GPUs" value={value.gpus} onChange={(gpus) => set({ gpus })} min={0} max={16} />
      <EntryRow label="Partition" value={value.partition} onChange={(partition) => set({ partition })}
        list={limits?.partitions} placeholder={limits?.default_partition} />
      <EntryRow label="Account" value={value.account} onChange={(account) => set({ account })} />
      <EntryRow label="QOS" value={value.qos} onChange={(qos) => set({ qos })} list={limits?.qos}
        placeholder={limits?.default_qos} />
    </>
  )
}
