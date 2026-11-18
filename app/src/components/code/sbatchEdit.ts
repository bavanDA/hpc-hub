import type { SizeFix } from '../../types/jobs'

const SHORT: Record<string, string> = { 'cpus-per-task': 'c' }

/** The script with hpchub-size's fix put in: memory for the job (in place of memory per core), and cores. */
export function withFix(text: string, fix: SizeFix): string {
  let out = text
  if (fix.mem_gb) out = setDirective(out, 'mem', `${fix.mem_gb}G`, ['mem-per-cpu'])
  if (fix.cpus) out = setDirective(out, 'cpus-per-task', String(fix.cpus))
  return out
}

/** The script with `#SBATCH --<flag>=<value>`. The first line that sets it (or one of `also`, which it replaces, as
 * --mem replaces --mem-per-cpu) becomes the new line and the other ones go; with none, the line goes after the last
 * #SBATCH line, else after #!. Only the lines Slurm reads count: the ones before the first command. */
export function setDirective(text: string, flag: string, value: string, also: string[] = []): string {
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  const lines = text.split(eol)
  const names = [flag, ...also]
  const shorts = names.map((n) => SHORT[n]).filter(Boolean)
  const sets = (line: string) => {
    const m = line.match(/^#SBATCH\s+(--([\w-]+)|-(\w))/)
    return !!m && (m[2] ? names.includes(m[2]) : shorts.includes(m[3]))
  }
  const line = `#SBATCH --${flag}=${value}`
  const found: number[] = []
  let last = -1
  for (let i = 0; i < lines.length; i++) {
    const s = lines[i].trim()
    if (s && !s.startsWith('#')) break
    if (/^#SBATCH\b/.test(s)) last = i
    if (sets(s)) found.push(i)
  }
  if (found.length) {
    return lines.flatMap((l, i) => (i === found[0] ? [line] : found.includes(i) ? [] : [l])).join(eol)
  }
  const at = last >= 0 ? last + 1 : lines[0]?.startsWith('#!') ? 1 : 0
  return [...lines.slice(0, at), line, ...lines.slice(at)].join(eol)
}
