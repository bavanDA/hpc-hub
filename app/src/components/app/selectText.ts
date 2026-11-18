// Which highlighted text Select to copy everywhere copies (selectCopy.ts); apart so it tests without a window.

type Sel = Pick<Selection, 'isCollapsed' | 'toString'> & { anchorNode: Node | null }

/** The text to copy for this selection, or "" when it isn't ours to copy (a terminal, a text box, nothing). */
export function selectedText(sel: Sel | null): string {
  if (!sel || sel.isCollapsed) return ''
  const node = sel.anchorNode
  const at = node && 'closest' in node ? node as Element : node?.parentElement
  if (!at || at.closest('.xterm, input, textarea, [contenteditable=""], [contenteditable="true"]')) return ''
  return sel.toString().trim() ? sel.toString() : ''
}
