// What you type in a Claude tab's chat box, kept until you send it. It lived only in the chat view, so it went when
// the view did: another page, the Terminal view, a reload (a quick fix), a command from the / menu
// (2026-11-23 report: "she wrote long text ... all the text disappeared"). Kept on this computer only.

const PREFIX = 'hpchub-chat-draft:'
export const DRAFT_MAX = 200_000  // characters kept at most

const keyOf = (t: { cluster: string; session: string }) => `${PREFIX}${t.cluster}/${t.session}`

export function loadDraft(t: { cluster: string; session: string }): string {
  try { return localStorage.getItem(keyOf(t)) ?? '' } catch { return '' }
}

/** Keep text for the tab; empty (sent, or cleared) forgets it. */
export function saveDraft(t: { cluster: string; session: string }, text: string) {
  try {
    if (text.trim()) localStorage.setItem(keyOf(t), text.slice(0, DRAFT_MAX))
    else localStorage.removeItem(keyOf(t))
  } catch { /* storage off: kept while the view shows */ }
}
