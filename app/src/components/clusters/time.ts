// Slurm times as minutes and back, like hpc_hub/compute/limits.py (minutes, slurm_time, human).
const SLURM_TIME = /^(?:(\d+)-)?(\d+)(?::(\d+))?(?::(\d+))?$/

/** '3-00:00:00' -> 4320, '8:00:00' -> 480, '30' -> 30. null: not a time. */
export function minutes(text: string): number | null {
  const m = SLURM_TIME.exec(text.trim())
  if (!m) return null
  const [days, a, b, c] = m.slice(1).map((x) => (x === undefined ? null : parseInt(x, 10)))
  if (days !== null) return days * 1440 + a! * 60 + (b ?? 0) + (c ? 1 : 0)
  if (c !== null) return a! * 60 + b! + (c ? 1 : 0)
  if (b !== null) return a! + (b ? 1 : 0)
  return a
}

const two = (n: number) => String(n).padStart(2, '0')

/** 90 -> 01:30:00, 1830 -> 1-06:30:00. */
export function slurmTime(total: number): string {
  const t = Math.max(Math.round(total), 1)
  const days = Math.floor(t / 1440), rest = t % 1440
  const hm = `${two(Math.floor(rest / 60))}:${two(rest % 60)}:00`
  return days ? `${days}-${hm}` : hm
}

/** 4320 -> '3 days', 1830 -> '1 day 6 h 30 min'. */
export function human(total: number): string {
  const days = Math.floor(total / 1440), h = Math.floor((total % 1440) / 60), m = total % 60
  const parts = [days ? `${days} day${days === 1 ? '' : 's'}` : '', h ? `${h} h` : '', m ? `${m} min` : '']
  return parts.filter(Boolean).join(' ') || '0 min'
}
