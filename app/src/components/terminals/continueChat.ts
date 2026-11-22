// Continue on an ended Claude tab (2026-11-22, the owner: "add continue button, so when user click on it can
// continue"). A Claude chat HPC Hub started is saved by Claude on the cluster, and its tab's tmux name ends in the
// chat id's first 8 characters: chat.where finds the chat and its folder from that alone, also after the job ended,
// and tools.agent_start runs claude --resume there (on the node you have, or a new one).

const CLAUDE_TAB = /^hpchub-claude-\d*-?[0-9a-f]{8}$/  // as agents/chat_view.py TAG

export const canContinue = (session: string) => CLAUDE_TAB.test(session)

/** The tab's own name for the new tab: "Claude · HANDOFF.md" gives "HANDOFF.md". */
export function continueLabel(title: string): string {
  return title.replace(/^Claude\s*·\s*/, '').trim()
}

/** What the tab says once its session is gone, and whether it offers Continue. */
export function endedNote(session: string): { text: string; button?: string } {
  return canContinue(session)
    ? { text: 'This Claude session has ended. Continue the chat where it stopped, or close this tab.',
        button: 'Continue' }
    : { text: 'This session has ended. Close this tab, or start a new one from the list.' }
}
