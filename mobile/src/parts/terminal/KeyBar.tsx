// The keys a phone keyboard lacks, under the terminal. Ctrl and Alt each bring up their own row for the next key; a
// key never takes the focus, so the keyboard stays up.
import { useState } from 'react'

import { historyOf } from '@shared/components/terminals/history/view'
import type { Tab } from '@shared/components/terminals/tabs'

const KEYS: [string, string][] = [['|', '|'], ['/', '/'], ['↑', '\x1b[A'], ['↓', '\x1b[B'], ['←', '\x1b[D'],
  ['→', '\x1b[C'], ['~', '~'], ['-', '-']]
const CTRL = ['C', 'D', 'Z', 'L', 'R', 'A', 'E', 'U', 'W', 'B']
const ALT = ['b', 'f', 'd', '.']

export function KeyBar({ tab }: { tab: Tab }) {
  const [mod, setMod] = useState<'' | 'ctrl' | 'alt'>('')
  const send = (data: string) => { historyOf(tab).back(); tab.term.input(data, true); tab.term.focus(); setMod('') }
  const key = (label: string, run: () => void, on = false) => (
    <button key={label} onPointerDown={(e) => e.preventDefault()} onClick={run}
      className={`h-[38px] min-w-11 flex-1 shrink-0 rounded-md px-1.5 text-[13px] font-semibold active:bg-pressed ${
        on ? 'bg-accent text-on-accent' : 'bg-window'}`}>{label}</button>
  )
  return (
    <div className="flex shrink-0 gap-1 overflow-x-auto border-t border-line bg-soft px-1.5 pt-1.5 pb-1" role="toolbar"
      aria-label="Keys">
      {key('Esc', () => send('\x1b'))}
      {key('Tab', () => send('\t'))}
      {key('Ctrl', () => setMod(mod === 'ctrl' ? '' : 'ctrl'), mod === 'ctrl')}
      {key('Alt', () => setMod(mod === 'alt' ? '' : 'alt'), mod === 'alt')}
      {mod === 'ctrl' && CTRL.map((c) => key(`^${c}`, () => send(String.fromCharCode(c.charCodeAt(0) - 64))))}
      {mod === 'alt' && ALT.map((c) => key(`Alt ${c}`, () => send(`\x1b${c}`)))}
      {!mod && KEYS.map(([label, data]) => key(label, () => send(data)))}
    </div>
  )
}
