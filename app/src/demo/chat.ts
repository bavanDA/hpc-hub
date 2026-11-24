// Demo data for the Chat view of a Claude tab: a made-up conversation, and a question waiting for an answer.
import type { ChatEvent, ReadAnswer, Screen } from '../components/chat/model'

const CWD = '/home/jdoe/thesis'
const FILE = '~/.claude/projects/-home-jdoe-thesis/3f2a9c1e-0000-4000-8000-000000000001.jsonl'

const EVENTS: ChatEvent[] = [
  { kind: 'user', id: 'u1', text: 'The k=80 run ran out of memory again. Can you find why and resubmit it with the right size?' },
  { kind: 'text', id: 'a1', text: "I'll look at the last run's log and at what Slurm measured for the earlier runs." },
  { kind: 'tool', id: 't1', name: 'Read', input: { file_path: `${CWD}/logs/run-1606.out` } },
  { kind: 'result', id: 'r1', tool: 't1', error: false,
    text: 'k=80  building hub table (h=21)…\nslurmstepd: error: Detected 1 oom_kill event in StepId=1606.batch.\nSome of the step tasks have been OOM Killed.' },
  { kind: 'tool', id: 't2', name: 'Bash', input: { command: 'hpchub-size job.sh', description: 'What earlier runs used' } },
  { kind: 'result', id: 'r2', tool: 't2', error: false,
    text: 'run 1606  k=80  peak 41.2 GB of 32 GB asked   out of memory\nrun 1591  k=60  peak 18.7 GB of 32 GB asked   7.6 of 8 cores busy\nSuggested: --mem=50G --cpus-per-task=8 --time=02:00:00' },
  { kind: 'text', id: 'a2', text: 'The hub table grows past **32 GB** at k=80, so the job is killed partway. I\'ll ask for 50 GB, keep 8 cores, and resubmit:\n```bash\nsbatch job.sh\n```' },
  { kind: 'tool', id: 't3', name: 'Edit', input: { file_path: `${CWD}/job.sh`,
    old_string: '#SBATCH --cpus-per-task=8\n#SBATCH --mem=32G\n#SBATCH --time=02:00:00',
    new_string: '#SBATCH --cpus-per-task=8\n#SBATCH --mem=50G\n#SBATCH --time=02:00:00' } },
  { kind: 'result', id: 'r3', tool: 't3', error: false, text: 'The file job.sh has been updated.' },
  { kind: 'tool', id: 't4', name: 'TodoWrite', input: { todos: [
    { content: 'Find why k=80 failed', status: 'completed' }, { content: 'Size the job from earlier runs', status: 'completed' },
    { content: 'Resubmit and watch the first minutes', status: 'in_progress' }] } },
  { kind: 'tool', id: 't5', name: 'Bash', input: { command: 'sbatch job.sh', description: 'Submit the resized job' } },
]

let answered = ''
let mode: Screen['mode'] = 'ask'
// what you send in the demo: in the chat a moment later, as from Claude's file, and a short answer after it
const said: ChatEvent[] = []
let busyUntil = 0

function say(text: string) {
  if (text.trim().startsWith('/')) return
  const n = said.length
  setTimeout(() => said.push({ kind: 'user', id: `d${n}`, text: text.trim() }), 1200)
  busyUntil = Date.now() + 3500
  setTimeout(() => said.push({ kind: 'text', id: `d${n}-a`,
    text: 'This is the demo, so nothing ran. On a cluster Claude would answer here.' }), 3500)
}

const ASK = { question: 'Do you want to proceed?', detail: 'Bash command\n\n  sbatch job.sh\n  Submit the resized job',
  permission: true, options: [{ key: '1', label: 'Yes' },
    { key: '2', label: `Yes, and don't ask again for sbatch commands in ${CWD}` },
    { key: '3', label: 'No, and tell Claude what to do differently (esc)' }] }

function read({ offset }: { offset: number }): ReadAnswer {
  const after: ChatEvent[] = answered === '3' ? [{ kind: 'result', id: 'r5', tool: 't5', error: true, text: 'You said no.' }]
    : answered ? [{ kind: 'result', id: 'r5', tool: 't5', error: false, text: 'Submitted batch job 1606417' },
      { kind: 'text', id: 'a3', text: 'Submitted. Where things stand:\n\n| | k | memory | state |\n|---|---|---|---|\n| **1591** | 60 | 18.7 of 32 GB | done |\n| **1606** | 80 | over 32 GB | out of memory |\n| **1606417** | 80 | asks `--mem=50G` | waiting |\n\nI\'ll check on it once it starts.' }] : []
  if (offset >= 0 && !after.length && !said.length) return { file: FILE, offset, size: offset, trimmed: false, cwd: CWD, events: [] }
  return { file: FILE, offset: 9000 + after.length + said.length, size: 9000, trimmed: false, cwd: CWD,
    events: [...EVENTS, ...after, ...said] }
}

export const answers: Record<string, unknown> = {
  'chat.read': read,
  'chat.where': () => ({ chat_id: '3f2a9c1e-1111-4222-8333-444455556666', folder: '/home/jdoe/thesis' }),
  'chat.screen': (): Screen => ({ busy: Date.now() < busyUntil, mode, ask: answered ? null : ASK }),
  'chat.key': ({ key }: { key: string }) => { if (/^[1-3]$/.test(key)) answered = key; return null },
  'chat.send': ({ text }: { text: string }) => { say(text); return { replaced: false } },
  'chat.stop': () => ({ stopped: false }),
  'chat.mode': ({ mode: m }: { mode: Screen['mode'] }): Screen => { mode = m; return { busy: false, mode, ask: answered ? null : ASK } },
}
