// Continue on an ended Claude or ChatGPT tab (2026-11-22, the owner: "add continue button, so when user click on it
// can continue"; 2026-11-25, on an ended ChatGPT tab: "where is the continue button"). The chat HPC Hub started is
// saved by the agent on the cluster: chat.where finds it and its folder from the tab's tmux name (and a ChatGPT
// tab's title), also after the job ended, and tools.agent_start resumes it there (on the node you have, or a new
// one). A Claude tab's name ends in the chat id's first 8 characters; a ChatGPT tab's in those when it resumed a
// chat, or in the time it started one (Codex picks its own id: agents/codex_where.py).

const CLAUDE_TAB = /^hpchub-claude-\d*-?[0-9a-f]{8}$/  // as agents/chat_view.py TAG
const CODEX_TAB = /^hpchub-codex-(?:\d+-)?(?:[0-9a-f]{8}|\d{6})$/  // as agents/codex_where.py TAB

/** The agent whose chat an ended tab can continue: '' when it has none HPC Hub can find. */
export function chatAgent(session: string): 'claude' | 'codex' | '' {
  return CLAUDE_TAB.test(session) ? 'claude' : CODEX_TAB.test(session) ? 'codex' : ''
}

export const canContinue = (session: string) => chatAgent(session) !== ''

/** The tab's own name for the new tab: "Claude · HANDOFF.md" gives "HANDOFF.md", "ChatGPT · thesis" "thesis". */
export function continueLabel(title: string): string {
  return title.replace(/^(Claude|ChatGPT)\s*·\s*/, '').trim()
}

const NAMES = { claude: 'Claude', codex: 'ChatGPT' }

/** What the tab says once its session is gone, and whether it offers Continue. */
export function endedNote(session: string): { text: string; button?: string } {
  const agent = chatAgent(session)
  return agent
    ? { text: `This ${NAMES[agent]} session has ended. Continue the chat where it stopped, or close this tab.`,
        button: 'Continue' }
    : { text: 'This session has ended. Close this tab, or start a new one from the list.' }
}
