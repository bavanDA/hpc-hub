const listeners = new Set<() => void>()

export const openSettings = () => listeners.forEach((fn) => fn())

export function onOpenSettings(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}
