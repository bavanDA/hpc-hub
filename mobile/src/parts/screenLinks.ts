// The links on a terminal's screen and recent history, newest first. tmux redraws long lines as separate rows
// (not marked as wrapped), so a row that fills the whole width runs on into the next one.
import type { Tab } from '@shared/components/terminals/tabs'

const URL = /https?:\/\/[^\s'"<>()]*[^\s'"<>().,;:!?\]]/g
const ROWS = 600

export function screenLinks(tab: Tab): string[] {
  const buffer = tab.term.buffer.active
  const cols = tab.term.cols
  let text = ''
  let full = false
  for (let i = Math.max(0, buffer.length - ROWS); i < buffer.length; i++) {
    const line = buffer.getLine(i)
    if (!line) continue
    const row = line.translateToString(true)
    text += (line.isWrapped || full ? '' : '\n') + row
    full = row.length >= cols
  }
  return [...new Set(text.match(URL) ?? [])].reverse()
}
