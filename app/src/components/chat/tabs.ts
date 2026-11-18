// Which tabs have a Chat view: Claude's, started by HPC Hub (hpchub-claude-<job>-<id start>).

/** The chat id's first 8 characters, from the tab's tmux name ("" when it has none). */
export const tagOf = (session: string) => /^hpchub-claude-\d*-?([0-9a-f]{8})$/.exec(session)?.[1] ?? ''

export const isClaudeTab = (t: { session: string }) => t.session.startsWith('hpchub-claude-')

const KEY = 'hpchub-chat-view'
/** Chat or Terminal, as you last chose (Chat at first). */
export function lastView(): 'chat' | 'terminal' {
  try { return localStorage.getItem(KEY) === 'terminal' ? 'terminal' : 'chat' } catch { return 'chat' }
}
export function rememberView(v: 'chat' | 'terminal') {
  try { localStorage.setItem(KEY, v) } catch { /* only for this visit */ }
}
