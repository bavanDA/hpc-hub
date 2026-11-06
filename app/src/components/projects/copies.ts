import { on } from '../../rpc'
import type { Transfer } from '../../types/projects'

let copies: Transfer[] = []
const listeners = new Set<() => void>()

export function setCopies(next: Transfer[]) {
  copies = next
  listeners.forEach((fn) => fn())
}

on('transfer', (d) => {
  const t = d as Transfer
  if (!t.id.startsWith('project-')) return  // the Files page shows its own
  setCopies(copies.some((x) => x.id === t.id) ? copies.map((x) => x.id === t.id ? t : x) : [t, ...copies])
})

/** Show a copy before its first event arrives. */
export function expectCopies(ids: string[], title: string) {
  setCopies([...ids.filter((id) => !copies.some((x) => x.id === id)).map((id) => ({
    id, title, done: 0, total: 0, status: 'Starting', finished: false, error: '' })), ...copies])
}

export const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn) } }

export const getCopies = () => copies
