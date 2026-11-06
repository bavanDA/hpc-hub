export const tabKey = (cluster: string, session: string) => `${cluster}/${session}`

/** The tab to show once `closing` is gone: the one that takes its place, else the new last one. */
export function nextCurrent(keys: string[], closing: string, current: string | null): string | null {
  if (current !== closing) return current
  const i = keys.indexOf(closing)
  const rest = keys.filter((k) => k !== closing)
  return rest[Math.min(i, rest.length - 1)] ?? null
}
