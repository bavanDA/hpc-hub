// Picking rows like a file manager: a click picks one, Ctrl (⌘ on a Mac) adds or drops one, Shift picks the run
// from the last one clicked.

export type How = 'one' | 'toggle' | 'range'

export const howOf = (ev: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }): How =>
  ev.shiftKey ? 'range' : ev.ctrlKey || ev.metaKey ? 'toggle' : 'one'

/** The rows picked after a click on name; anchor is the last row clicked without Shift. */
export function pick(names: string[], picked: Set<string>, anchor: string | null, name: string, how: How): Set<string> {
  if (how === 'toggle') {
    const next = new Set(picked)
    if (next.has(name)) next.delete(name)
    else next.add(name)
    return next
  }
  if (how === 'range' && anchor !== null && names.includes(anchor)) {
    const [a, b] = [names.indexOf(anchor), names.indexOf(name)].sort((x, y) => x - y)
    return new Set(names.slice(a, b + 1))
  }
  return new Set([name])
}
