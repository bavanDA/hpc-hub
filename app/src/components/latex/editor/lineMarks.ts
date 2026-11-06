import { RangeSetBuilder, StateEffect, StateField, type Transaction } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView } from '@codemirror/view'

import type { Issue } from '../../../types/latex'

export const setIssues = StateEffect.define<Issue[]>()
export const flash = StateEffect.define<number>()

/** One class per line with issues, in line order; the last issue on a line wins. */
export function issueClasses(issues: Issue[]): [number, string][] {
  return [...new Map(issues.filter((i) => i.line > 0).sort((x, y) => x.line - y.line)
    .map((i) => [i.line, `cm-issue-${i.level}`])).entries()]
}

function lines(f: (tr: Transaction) => [number, string][] | null) {
  return StateField.define<DecorationSet>({
    create: () => Decoration.none,
    update(deco, tr) {
      const want = f(tr)
      if (!want) return deco.map(tr.changes)
      const b = new RangeSetBuilder<Decoration>()
      for (const [n, cls] of want) {
        if (n < 1 || n > tr.state.doc.lines) continue
        const at = tr.state.doc.line(n).from
        b.add(at, at, Decoration.line({ class: cls }))
      }
      return b.finish()
    },
    provide: (field) => EditorView.decorations.from(field),
  })
}

export const issueLines = lines((tr) => {
  const e = tr.effects.find((x) => x.is(setIssues))
  return e ? issueClasses(e.value as Issue[]) : null
})

/** A short flash on the line a jump landed on. */
export const flashLine = lines((tr) => {
  const e = tr.effects.find((x) => x.is(flash))
  return e ? [[e.value as number, 'cm-flash']] : null
})
