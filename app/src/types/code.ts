// The Code page's backend contract (docs/design/code.md): open and save files on a cluster safely, notice when an
// agent changes them, and ask an agent about a piece of code. hpc_hub/api/methods/code.py and code_ask.py answer these.

/** code.open(cluster, path): the text and what's needed to save it back without losing anything. */
export type OpenedFile = {
  path: string            // the path you asked for
  text: string            // empty when the file isn't text (see lossy)
  sha: string             // sha256 of the bytes on the cluster, the base for code.save's check
  mtime: number           // seconds since 1970
  size: number            // bytes
  eol: 'lf' | 'crlf'      // kept as it was when saving
  writable: boolean
  readonly_reason: string // '' when writable; else why ("Not UTF-8 text", "Bigger than 2 MB", "No write permission")
  lossy: boolean          // the bytes aren't UTF-8: shown read-only so saving can't damage them
}

/** code.save(cluster, path, text, base_sha, eol?, force?): saves only if the file is still what you opened; eol
 *  from code.open keeps the line endings. */
export type SaveResult =
  | { saved: true; sha: string; mtime: number }
  | { saved: false; conflict: true; sha: string; mtime: number }  // changed on the cluster since base_sha

/** code.stat(cluster, paths): what each open file looks like now, to notice changes from an agent or a job. */
export type FileState = { path: string; exists: boolean; sha: string; mtime: number; size: number }

/** code.find_files(cluster, root, query): files under root whose name matches, for "Go to file". */
export type FoundFile = { path: string; name: string }

/** code.grep(cluster, root, text): matching lines, for "Find in folder". */
export type GrepHit = { path: string; line: number; text: string }

// -- asking an agent about code ------------------------------------------------------------------------------------

export type AskKind = 'explain' | 'fix' | 'test' | 'free'

/** What the ask is about: a whole file, or some lines of it (1-based, inclusive). */
export type AskContext = { cluster: string; path: string; from_line?: number; to_line?: number }

/** code.ask_start: runs the agent once on the cluster (in tmux, so it outlives the app) and answers its id. */
export type AskRequest = AskContext & {
  agent: string           // 'claude', 'codex', ... (tools.installed)
  kind: AskKind
  question: string        // the user's words; '' for the shortcuts
  error_text?: string     // for 'fix': the error the user pasted or picked (a job's .err, a terminal)
  node?: string           // run on this node; '' = the cluster's node if there is one, else ask for one
}

export type AskState = 'starting' | 'waiting_for_node' | 'running' | 'done' | 'failed' | 'cancelled'

/** code.ask_status(cluster, id) and each row of code.asks(cluster). */
export type AskStatus = {
  id: string
  state: AskState
  kind: AskKind
  agent: string
  path: string
  started: number         // seconds since 1970
  detail: string          // plain words for the card ("Waiting for a node", "Claude is reading train.py")
}

/** One file the agent wants to change or add, as full text: the UI shows it as a diff to accept or reject. */
export type ProposedFile = {
  path: string
  base_sha: string        // the file's sha when the agent started ('' for a new file)
  original: string        // its text then ('' for a new file)
  proposed: string
  is_new: boolean
}

/** code.ask_result(cluster, id): the agent's answer and its proposed changes. */
export type AskResult = {
  id: string
  answer: string          // plain Markdown
  files: ProposedFile[]
  chat_id: string         // to keep talking in a terminal (tools.agent_start); '' when the agent has none
}
