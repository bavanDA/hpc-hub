import { describe, expect, it } from 'vitest'

import { selectedText } from './selectText'

// a text node inside an element matching what closest() is asked about
const sel = (text: string, inside: string[] = []) => ({
  isCollapsed: !text, toString: () => text,
  anchorNode: { parentElement: { closest: (q: string) => inside.some((s) => q.includes(s)) ? {} : null } },
}) as unknown as Parameters<typeof selectedText>[0]

describe('select to copy everywhere', () => {
  it('copies text on the page, not a terminal or a text box', () => {
    expect(selectedText(sel('job 123 on n0042'))).toBe('job 123 on n0042')
    expect(selectedText(sel('ls -la', ['.xterm']))).toBe('')
    expect(selectedText(sel('notes', ['textarea']))).toBe('')
    expect(selectedText(sel('', []))).toBe('')
    expect(selectedText(sel('   '))).toBe('')
  })
})
