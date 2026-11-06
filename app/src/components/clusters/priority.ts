/** "Low", "Standard", "High (mygroup)" for low, standard, high_mygroup; "Default" for none. */
export function priorityName(qos?: string): string {
  const q = (qos ?? '').trim()
  if (!q) return 'Default'
  const high = /^high_(.+)$/.exec(q)
  if (high) return `High (${high[1]})`
  return q.charAt(0).toUpperCase() + q.slice(1).replaceAll('_', ' ')
}

/** A group to bill, "(default)" after Slurm's default one; "Default" for none picked. */
export function groupName(account?: string, fallback = ''): string {
  const a = (account ?? '').trim()
  return a ? `${a}${a === fallback ? ' (default)' : ''}` : fallback ? `${fallback} (default)` : 'Default'
}

/** The queue and its priority as one value: "general, Low"; a priority named like its queue says nothing. */
export function queueText(queue?: string, qos?: string): string {
  const q = (queue ?? '').trim(), b = (qos ?? '').trim()
  return [q, b && b !== q ? priorityName(b) : ''].filter(Boolean).join(', ') || 'Default'
}

/** One of the queues a node request tries, named so no queue is said twice: "Low priority" on the usual queue,
 *  "Debug queue" for a queue of its own, "Gpu queue, low priority". */
export function queueRowName(queue: string, qos: string, usual = ''): string {
  const priority = qos && qos !== queue ? `${priorityName(qos)} priority` : ''
  if (priority && queue === (usual || queue)) return priority
  const name = `${queue.charAt(0).toUpperCase()}${queue.slice(1)} queue`
  return priority ? `${name}, ${priority.toLowerCase()}` : name
}
