import { SquareTerminal } from 'lucide-react'

import { TOGGLE_KEY } from './panel'
import { terminalCount } from './text'

/** The status line's button that shows or hides the terminal panel. */
export function TerminalToggle({ shown, count, onToggle }: { shown: boolean; count: number; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} aria-pressed={shown}
      title={`${shown ? 'Hide' : 'Show'} the terminal (${TOGGLE_KEY})`}
      className={`-ml-1.5 flex h-7 shrink-0 items-center gap-1.5 px-1.5 hover:bg-hover hover:text-text
        ${shown ? 'text-text' : ''}`}>
      <SquareTerminal size={13} />
      {terminalCount(count)}
    </button>
  )
}
