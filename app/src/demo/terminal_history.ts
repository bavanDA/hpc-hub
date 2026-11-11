// Demo data for the terminal rail: a made-up Claude session's history and its marks, kept in the browser. Run
// hpchub-term-1022-200000 ("Finished run") to see an ended session: its marks only have their saved text.
import type { HistoryOutline, HistoryWindow, Mark, MarksAnswer } from '../types/terminals'

const ENDED = 'hpchub-term-1022-200000'
const STORE = 'hpchub-demo-marks'
const LIMIT = 50000
const WIDTH = 96
const HEIGHT = 40
const c = (code: string, text: string) => `\x1b[${code}m${text}\x1b[0m`

function sampleRows(): string[] {
  const rows: string[] = []
  rows.push(c('2', 'Session started in /home/jdoe/thesis (Demo terminal: no cluster in the browser)'), '')
  rows.push(`${c('1;32', 'jdoe@login1')}:${c('1;34', '~/thesis')}$ claude`)
  const turns = [
    ['> which learning rate schedule gave the best validation accuracy?', 'lr'],
    ['> train the resnet50 baseline for 200 epochs on 4 nodes', 'epochs'],
    ['> compare the two checkpoints and print a table', 'table'],
    ['> why did epoch 12 run out of memory?', 'oom'],
    ['> plot the loss for the last run', 'plot'],
    ['> summarise the results for the methods chapter', 'summary'],
  ]
  let epoch = 1
  for (const [prompt, kind] of turns) {
    rows.push('', c('1', prompt), '')
    rows.push(c('38;5;173', '●') + ' Let me look at the run logs in results/.', '')
    rows.push(c('2', '  Reading results/train.log, results/config.yaml'), '')
    if (kind === 'table') {
      rows.push('Validation accuracy by schedule, best of three seeds:', '')
      rows.push('┌────────────────┬───────────┬──────────┬──────────┐')
      rows.push('│ Schedule       │ Val top1  │ Val top5 │ Epochs   │')
      rows.push('├────────────────┼───────────┼──────────┼──────────┤')
      for (const [name, a, b, e] of [['cosine', '93.68', '98.91', '200'], ['step (30/60)', '92.40', '98.33', '200'],
        ['one cycle', '93.12', '98.72', '200'], ['constant 0.1', '89.77', '97.15', '200']]) {
        rows.push(`│ ${name.padEnd(14)} │ ${a.padEnd(9)} │ ${b.padEnd(8)} │ ${e.padEnd(8)} │`)
      }
      rows.push('└────────────────┴───────────┴──────────┴──────────┘', '')
      rows.push('Cosine decay wins by about half a point.', '')
    } else if (kind === 'oom') {
      rows.push(c('31', 'RuntimeError: CUDA out of memory. Tried to allocate 2.14 GiB on GPU 0.'))
      rows.push('  File "train.py", line 212, in train_one_epoch', '    loss.backward()', '')
      rows.push('The batch size doubled when the second loader started. Lowering it to 128 keeps it under 22 GiB.', '')
    } else {
      for (let i = 0; i < (kind === 'epochs' ? 260 : 60); i++, epoch++) {
        const loss = (2.3 / (1 + epoch / 40)).toFixed(3)
        const val = (70 + 24 * (1 - Math.exp(-epoch / 45))).toFixed(2)
        rows.push(`  epoch ${String(epoch).padStart(3)}/400  loss ${loss}  val ${val}`)
      }
      rows.push('', 'That run finished cleanly. The checkpoint is in results/ckpt-last.pt.', '')
    }
    rows.push(c('2', `  ${'-'.repeat(60)}`))
  }
  for (let i = 0; i < 1400; i++) rows.push(c('2', `  batch ${i + 1}/1400 done in ${(0.4 + (i % 7) / 10).toFixed(2)}s`))
  rows.push('', `${c('1;32', 'jdoe@login1')}:${c('1;34', '~/thesis')}$ `)
  return rows
}

const SAMPLE = sampleRows()
// eslint-disable-next-line no-control-regex
const plain = (row: string) => row.replace(/\x1b\[[0-9;]*m/g, '')
const PLAIN = SAMPLE.map(plain)

const meta = (session: string) => {
  const history = Math.max(SAMPLE.length - HEIGHT, 0)
  return session === ENDED ? null : { total: SAMPLE.length, history, limit: LIMIT, height: HEIGHT, width: WIDTH, alternate: false, in_mode: false }
}

const KINDS: [RegExp, number][] = [[/[│┌├└]/, 2], [/^(\s*>|jdoe@)/, 3]]
const kindOf = (row: string) => row.trim() ? KINDS.find(([re]) => re.test(row))?.[1] ?? 1 : 0

function outline({ session, buckets = 300 }: { session: string; buckets?: number }): HistoryOutline {
  const m = meta(session)
  if (!m) return { gone: true } as HistoryOutline
  const map: [number, number][] = Array.from({ length: buckets }, () => [0, 0])
  const prompts: number[] = []
  PLAIN.forEach((row, i) => {
    const b = Math.min(buckets - 1, Math.floor((i * buckets) / m.total))
    const k = kindOf(row)
    map[b] = [Math.max(map[b][0], k), Math.max(map[b][1], row.length)]
    if (k === 3) prompts.push(i)
  })
  return { ...m, map, prompts }
}

function history({ session, start, count = 200 }: { session: string; start: number | null; count?: number }): HistoryWindow {
  const m = meta(session)
  if (!m) return { gone: true } as HistoryWindow
  const first = start === null ? Math.max(m.total - count, 0) : Math.min(Math.max(start, 0), m.total - 1)
  return { ...m, start: first, rows: SAMPLE.slice(first, first + count) }
}

type Stored = { name: string; line: number; rows: number; text: string; created: number; id: string }

function seed(session: string): Stored[] {
  const lineOf = (needle: string) => PLAIN.findIndex((r) => r.includes(needle))
  const table = lineOf('┌──')
  const oom = lineOf('out of memory')
  const take = (start: number, rows: number) => PLAIN.slice(start, start + rows).join('\n')
  const trimmedText = 'Epoch 3: resumed from an older checkpoint\nvalidation accuracy dropped by 1.2 points'
  const saved: Stored = { id: 'gone', name: 'Old checkpoint', line: 4, rows: 2, text: trimmedText, created: 1000 }
  if (session === ENDED) return [saved]
  return [
    { id: 'table', name: 'Schedule comparison', line: table, rows: 8, text: take(table, 8), created: 1002 },
    { id: 'oom', name: 'Out of memory on epoch 12', line: oom, rows: 4, text: take(oom, 4), created: 1001 },
    saved,
  ]
}

const key = (s: string) => `${STORE}/${s}`

function load(session: string): Stored[] {
  try {
    const raw = localStorage.getItem(key(session))
    if (raw) return JSON.parse(raw) as Stored[]
  } catch { /* private window: back to the sample below */ }
  return seed(session)
}

function save(session: string, marks: Stored[]) {
  try { localStorage.setItem(key(session), JSON.stringify(marks)) } catch { /* private window: lost on reload */ }
}

function resolved(session: string): MarksAnswer {
  const m = meta(session)
  const marks: Mark[] = load(session).map((s) => {
    const firstRow = s.text.split('\n').find((l) => l.trim())
    const at = firstRow ? PLAIN.findIndex((r) => r.trimEnd() === firstRow.trimEnd()) : -1
    return { ...s, live: !!m && at >= 0, line: at >= 0 ? at : s.line }
  }).sort((a, b) => Number(b.live) - Number(a.live) || a.line - b.line)
  return { marks, ended: !m }
}

let seq = 0

export const answers: Record<string, unknown> = {
  'terminals.history': history,
  'terminals.outline': outline,
  'terminals.marks': ({ session }: { session: string }) => resolved(session),
  'terminals.mark_add': ({ session, name, line, rows, text }: { session: string; name: string; line: number; rows: number; text: string }) => {
    const mark = { id: `m${Date.now()}-${++seq}`, name: name.trim() || 'Mark', line, rows, text, created: Math.floor(Date.now() / 1000) }
    save(session, [...load(session), mark])
    return mark
  },
  'terminals.mark_rename': ({ session, id, name }: { session: string; id: string; name: string }) => {
    save(session, load(session).map((m) => m.id === id ? { ...m, name } : m))
    return null
  },
  'terminals.mark_remove': ({ session, id }: { session: string; id: string }) => {
    save(session, load(session).filter((m) => m.id !== id))
    return null
  },
}
