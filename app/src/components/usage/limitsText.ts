import type { Billing } from '../../types/clusters'
import { n } from './format'

const num = (v: number) => (v >= 10 ? n(Math.round(v)) : String(Math.round(v * 100) / 100))
const plural = (v: number, one: string) => `${n(v)} ${one}${v === 1 ? '' : 's'}`

/** The caps of a priority: "4,096 cores, 32 nodes"; "" for none. */
export function capsText(caps: Record<string, number>): string {
  const gpus = Object.entries(caps).filter(([k]) => k === 'gpu' || k.startsWith('gpu:')).map(([k, v]) => {
    const kind = k.slice(4) || 'any GPU'
    return v ? `${n(v)} × ${kind}` : `no ${kind}`
  })
  return [caps.cpu !== undefined ? plural(caps.cpu, 'core') : '', caps.node !== undefined ? plural(caps.node, 'node') : '',
    caps.mem !== undefined ? `${n(caps.mem)} GB` : '', ...gpus].filter(Boolean).join(', ')
}

/** What an hour costs on a queue, in a few words: the main rate, and what else counts. */
export function costText(b: Billing | null, wholeNodes: boolean, hasGpus = false): { value: string; sub: string } {
  if (!b) return { value: 'Not listed', sub: '' }
  if (!b.factor) return { value: 'Free', sub: '' }
  const su = (v: number) => num(v / (b.per_su ?? 1))
  const w = b.weights
  if (wholeNodes && w.node) return { value: `${su(w.node)} SU per node`, sub: 'However little of it you use' }
  const cpu = w.cpu ?? 0, mem = w.mem ?? 0, gpu = w.gpu ?? 0
  const typed = Object.entries(w).filter(([k, v]) => k.startsWith('gpu:') && v).map(([k, v]) => `${k.slice(4)} ${su(v)}`)
  const main = gpu > cpu ? `${su(gpu)} SU per GPU` : `${su(cpu)} SU per core`
  const other = [gpu > cpu && cpu ? `${su(cpu)} per core` : '', mem ? `${su(mem)} per GB` : ''].filter(Boolean).join(' or ')
  const adds = b.max === '' ? 'plus' : 'or'
  return { value: main, sub: [other && `${adds} ${other}${b.max === '' ? '' : ' if that is more'}`,
    hasGpus && typed.length ? `GPUs add ${typed.join(', ')}` : ''].filter(Boolean).join('. ') }
}

/** What a priority does to the SUs: "Free", "Normal", "2x". */
export const factorText = (factor: number) => (!factor ? 'Free' : factor === 1 ? 'Normal' : `${num(factor)}x`)
