import type { CompletionContext } from '@codemirror/autocomplete'
import { describe, expect, it } from 'vitest'

import type { Issue } from '../../../types/latex'
import { argOptions, completions } from './completions'
import { issueClasses } from './lineMarks'

const words = { labels: ['fig:map', 'eq:loss'], cites: ['smith2020', 'doe2021'] }

/** Just enough of CodeMirror's context: the text before the cursor. */
function at(before: string, explicit = false) {
  return {
    explicit,
    matchBefore: (re: RegExp) => {
      const m = new RegExp(`(?:${re.source})$`).exec(before)
      return m ? { from: m.index, to: before.length, text: m[0] } : null
    },
  } as unknown as CompletionContext
}

const source = completions(() => words)

describe('argOptions', () => {
  it('picks the list for the command', () => {
    expect(argOptions('citep', words)).toEqual(words.cites)
    expect(argOptions('eqref', words)).toEqual(words.labels)
    expect(argOptions('begin', words)).toContain('figure')
    expect(argOptions('textbf', words)).toBeNull()
  })
})

describe('completions', () => {
  it('offers citation keys after the last comma', () => {
    const r = source(at('see \\cite{smith2020,d'))!
    expect(r.from).toBe('see \\cite{smith2020,'.length)
    expect(r.options.map((o) => o.label)).toEqual(words.cites)
  })

  it('offers labels inside \\ref', () => {
    const r = source(at('\\ref{'))!
    expect(r.from).toBe(5)
    expect(r.options.map((o) => o.label)).toEqual(words.labels)
  })

  it('offers nothing inside other arguments', () => {
    expect(source(at('\\textbf{bo'))).toBeNull()
  })

  it('offers commands after a backslash, without their arguments', () => {
    const r = source(at('x \\sec'))!
    expect(r.from).toBe(3)
    const section = r.options.find((o) => o.detail === 'section{}')
    expect(section?.label).toBe('section')
    expect(r.options.find((o) => o.detail === 'includegraphics[width=\\linewidth]{}')?.label).toBe('includegraphics')
  })

  it('waits for a backslash unless asked', () => {
    expect(source(at('plain text'))).toBeNull()
    expect(source(at('a \\'))).not.toBeNull()
  })
})

describe('issueClasses', () => {
  it('gives one class per line, in line order, and skips issues without a line', () => {
    const issues = [
      { line: 9, level: 'warning' }, { line: 0, level: 'error' }, { line: 3, level: 'box' }, { line: 9, level: 'error' },
    ] as Issue[]
    expect(issueClasses(issues)).toEqual([[3, 'cm-issue-box'], [9, 'cm-issue-error']])
  })
})
