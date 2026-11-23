// the list of terminals on the panel's right, shown or hidden (2026-11-22, owner: "I should have option to hide this
// part"); remembered on this computer only, shown when nothing is remembered
const LIST_KEY = 'hpchub.code.terminalList'
export function listShown(): boolean {
  try { return localStorage.getItem(LIST_KEY) !== 'hidden' } catch { return true }
}
export function rememberList(shown: boolean) {
  try { localStorage.setItem(LIST_KEY, shown ? 'shown' : 'hidden') } catch { /* only for this visit */ }
}
