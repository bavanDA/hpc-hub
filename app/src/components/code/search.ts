// Find and replace for our own search bar (the phone's and the desktop's), on top of CodeMirror's search. CodeMirror
// only highlights matches while its panel is open, so its panel is opened but kept hidden; the bar drives the query.
import { closeSearchPanel, findNext, findPrevious, getSearchQuery, openSearchPanel, replaceAll as cmReplaceAll,
  replaceNext, search, SearchQuery, setSearchQuery } from '@codemirror/search'
import type { Extension } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'

export type Find = {
  text: string
  replace?: string
  caseSensitive?: boolean
  wholeWord?: boolean
  regexp?: boolean
}

/** Where the bar is: "3 of 12". total stops counting at LIMIT (shown as "1000+"). */
export type FindCount = { index: number; total: number; capped: boolean; invalid: boolean }

const LIMIT = 1000

/** The editor part: CodeMirror's search state with an invisible panel. */
export function searchExtension(): Extension {
  return search({
    top: true,
    createPanel: () => {
      const dom = document.createElement('div')
      dom.className = 'cm-code-hidden-panel'
      return { dom }
    },
  })
}

function query(f: Find) {
  return new SearchQuery({ search: f.text, replace: f.replace ?? '', caseSensitive: !!f.caseSensitive,
    wholeWord: !!f.wholeWord, regexp: !!f.regexp })
}

/** Start or change the search; matches light up. An empty text clears it. */
export function setFind(view: EditorView, f: Find) {
  openSearchPanel(view)
  view.dispatch({ effects: setSearchQuery.of(query(f)) })
}

/** Stop searching: no more highlights. */
export function closeFind(view: EditorView) {
  view.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search: '' })) })
  closeSearchPanel(view)
}

/** How many matches, and which one is selected (0 when the selection isn't on a match). */
export function countFind(view: EditorView): FindCount {
  const q = getSearchQuery(view.state)
  if (!q.search) return { index: 0, total: 0, capped: false, invalid: false }
  if (!q.valid) return { index: 0, total: 0, capped: false, invalid: true }
  const sel = view.state.selection.main
  const cursor = q.getCursor(view.state)
  let total = 0
  let index = 0
  for (let m = cursor.next(); !m.done; m = cursor.next()) {
    total++
    if (m.value.from === sel.from && m.value.to === sel.to) index = total
    if (total >= LIMIT) return { index, total, capped: true, invalid: false }
  }
  return { index, total, capped: false, invalid: false }
}

/** "3 of 12", "12 matches", "No matches", for the bar. */
export function countText(c: FindCount): string {
  if (c.invalid) return 'Not a valid pattern'
  if (!c.total) return 'No matches'
  const total = c.capped ? `${LIMIT}+` : String(c.total)
  return c.index ? `${c.index} of ${total}` : c.total === 1 ? '1 match' : `${total} matches`
}

export const findNextMatch = (view: EditorView) => findNext(view)
export const findPreviousMatch = (view: EditorView) => findPrevious(view)

/** Replace the selected match (or go to the next one first). Read-only editors change nothing. */
export const replaceOne = (view: EditorView) => replaceNext(view)

/** Replace every match; answers how many were replaced. */
export function replaceEvery(view: EditorView): number {
  const before = countFind(view).total
  return cmReplaceAll(view) ? before : 0
}
