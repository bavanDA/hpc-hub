// ClusterConfig.queues: "general:low,debug:debug", queue and priority, tried in order
export type Queue = { queue: string; billing: string }

export const parseQueues = (text: string): Queue[] => text.split(',').map((s) => s.trim()).filter(Boolean)
  .map((s) => { const [queue = '', billing = ''] = s.split(':'); return { queue: queue.trim(), billing: billing.trim() } })

export const queuesText = (list: Queue[]) => list.filter((q) => q.queue.trim())
  .map((q) => (q.billing.trim() ? `${q.queue.trim()}:${q.billing.trim()}` : q.queue.trim())).join(',')

export function queueCount(text?: string) {
  const n = parseQueues(text ?? '').length
  return n === 0 ? 'The one you pick' : n === 1 ? '1 queue' : `${n} queues`
}
