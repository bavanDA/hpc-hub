// Demo history for the demo paper (demo/latex.ts): nine commits by jdoe, asmith and mygroup (made up), a tag, a
// second branch, saved versions, a push that stops on one spot, and PDFs of old versions typeset in the browser.
// The diffs are made here with a small line and word diff, close enough to the backend's for design work.
// This file sorts after latex.ts, so its answers for latex.git_commit and latex.chunk take over (and lean on it).
import type { Blame, Changes, FileDiff, GitJob, GitState, HCommit, Lanes, LineStory, Move, Refs, Row,
  SavedVersion, Spot, SwitchCheck, SyncState } from '../types/history'
import { demoEmit } from './events'
import { demoCall } from './index'
import { answers as latex } from './latex'

const FOLDER = '/home/jdoe/papers/sparse-downscaling'
const FILES = ['main.tex', 'sections/results.tex', 'refs.bib', 'README.md', 'reply.tex']
const now = () => Math.floor(Date.now() / 1000)
const T0 = now()
const HOUR = 3600
type Files = Record<string, string>
type Snap = { c: HCommit; files: Files }
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

// -- the paper's past: each step undoes one commit, newest first ---------------------------------------------------
function rep(f: Files, path: string, a: string, b: string) {
  if (f[path]?.includes(a)) f[path] = f[path].replace(a, b)
  else console.warn(`demo history: "${a.slice(0, 40)}" is not in ${path}`)
}
const TRAINING_START = '\\subsection{Training}'
function training(f: Files): string {
  const t = f['main.tex'], a = t.indexOf(TRAINING_START), b = t.indexOf('\\end{figure}\n', a) + '\\end{figure}\n\n'.length
  return a < 0 ? '' : t.slice(a, b)
}

type Step = { hash: string; ago: number; author: string; subject: string; body: string; tags?: string[]
  undo: (f: Files) => void }
const at = (days: number, h: number, m: number) => {
  const d = new Date()
  d.setDate(d.getDate() - days)
  d.setHours(h, m, 0, 0)
  return Math.floor(d.getTime() / 1000)
}
const STEPS: Step[] = [
  { hash: 'a91c3e2', ago: T0 - 2 * HOUR - 300, author: 'asmith', subject: 'Fix the smoothness weight: 0.1, not 0.01',
    body: 'Every run in the results used 0.1; the text said 0.01. Spotted in the mygroup reading session.',
    undo: (f) => rep(f, 'main.tex', '$\\lambda = 0.1$ for every run.', '$\\lambda = 0.01$ for every run.') },
  { hash: '7d02b18', ago: at(1, 16, 40), author: 'jdoe', subject: 'Give the real count for rainfall timing',
    body: 'asmith asked how many years improve. It is 7 of 10, from the run logs on Wulver.',
    undo: (f) => rep(f, 'sections/results.tex', 'improves on 7 of 10 test years.', 'improves in most test years.') },
  { hash: '3f0c7aa', ago: at(5, 18, 30), author: 'mygroup', subject: 'Move the training details up from the results',
    body: 'Readers kept asking for them next to the method. Moved here; the results keep the numbers only.',
    undo: (f) => {
      const block = training(f)
      rep(f, 'main.tex', block, '')
      rep(f, 'sections/results.tex', '\\section{Conclusion}', block.replace('as Figure~\\ref{fig:loss} shows.',
        'as the figure below shows.') + '\\section{Conclusion}')
    } },
  { hash: 'e5b9d41', ago: at(6, 22, 5), author: 'jdoe', subject: 'Say stations, not sites, everywhere',
    body: 'We had both words for the same thing. "Station" matches the data set, so it wins.',
    undo: (f) => {
      rep(f, 'main.tex', 'station scale temperature', 'site scale temperature')
      rep(f, 'main.tex', 'a single station. Statistical', 'a single site. Statistical')
      rep(f, 'sections/results.tex', 'held out stations.', 'held out sites.')
      rep(f, 'refs.bib', 'Station data for everyone', 'Site data for everyone')
      rep(f, 'README.md', 'Build with latexmk on Wulver.', 'Build with latexmk on Wulver. The site list is in data/.')
    } },
  { hash: 'c41e09d', ago: at(12, 11, 20), author: 'jdoe', subject: 'Version sent to arXiv', tags: ['v1-arxiv'],
    body: 'Submitted as v1. The abstract now gives the number.',
    undo: (f) => rep(f, 'main.tex', 'it lowers the error by 18\\% against', 'it lowers the error clearly against') },
  { hash: '5f2a8c4', ago: at(14, 9, 45), author: 'asmith', subject: 'Add the results section', body: '',
    undo: (f) => { rep(f, 'main.tex', '\\input{sections/results}\n\n', ''); delete f['sections/results.tex'] } },
  { hash: '9be0d17', ago: at(15, 14, 2), author: 'mygroup', subject: 'Fix bib keys after the merge', body: '',
    undo: (f) => { rep(f, 'main.tex', '\\cite{doe2023}', '\\cite{doe23}'); rep(f, 'refs.bib', '@article{doe2023,', '@article{doe23,') } },
  { hash: 'e07b3d1', ago: at(16, 10, 15), author: 'jdoe', subject: 'Method section and the loss',
    body: 'The loss with the smoothness term, and the two numbers we use for every run.',
    undo: (f) => {
      const t = f['main.tex'], a = t.indexOf('\\section{Method}'), b = t.indexOf('\\bibliographystyle')
      if (a > 0 && b > a) f['main.tex'] = t.slice(0, a) + t.slice(b)
    } },
  { hash: '31d8a0b', ago: at(17, 17, 0), author: 'asmith', subject: 'First outline', body: '',
    undo: (f) => { for (const k of Object.keys(f)) delete f[k] } },
]
// what is not committed yet: undone first to get the last commit
function uncommitted(f: Files) {
  rep(f, 'sections/results.tex', 'smooths away~\\cite{rivera2024}. The gains are largest\nnear coasts and mountains, where the '
    + 'coarse grid hides the most.\n', 'smooths away~\\cite{rivera2024}.\n')
  rep(f, 'refs.bib', '  booktitle = {Workshop on Open Data},\n', '  booktitle = {Open Data Workshop},\n  note = {to appear},\n')
}

const REPLY = 'Dear editor,\n\nWe thank Reviewer 2 for the careful reading.\n\n'
  + 'Why not downscale the fine grid directly? It does not fit on one node, as Section 2 now explains.\n\n'
  + 'The timing per year is in the list of Section 3.\n'
const BRANCH: { hash: string; ago: number; subject: string; body: string; files: (f: Files) => void }[] = [
  { hash: 'b88f2c6', ago: T0 - 40 * 60, subject: 'Answer reviewer 2 on the direct downscaling',
    body: 'Reviewer 2 asked why we do not downscale the fine grid directly. The reply now says it does not fit on one node.',
    files: (f) => { f['reply.tex'] = REPLY } },
  { hash: '0a6d3e1', ago: T0 - 2.5 * HOUR, subject: 'Reply letter: a first draft', body: '',
    files: (f) => { f['reply.tex'] = REPLY.split('\n\n').slice(0, 3).join('\n\n') + '\n' } },
  { hash: 'd1c9a77', ago: T0 - 3.2 * HOUR, subject: 'Start the reply to the reviewers', body: '',
    files: (f) => { f['reply.tex'] = 'Dear editor,\n' } },
]

let ready: Promise<void> | null = null
const snaps = new Map<string, Snap>()  // by hash
let mainLog: string[] = []  // newest first
let otherLog: string[] = []
let branch = 'main'
let savedVersions: SavedVersion[] = []
const savedFiles = new Map<string, Files>()
let ahead = 0
let fetched = T0 - 3 * HOUR
let pushTries = 0
const pdfs = new Map<string, Uint8Array>()

async function readNow(): Promise<Files> {
  const out: Files = {}
  for (const p of FILES) {
    try { out[p] = (await demoCall<{ text: string }>('latex.read', { path: `${FOLDER}/${p}` })).text } catch { /* none */ }
  }
  return out
}

function commitOf(s: Omit<Step, 'undo'>, parent: string, files: Files, before: Files): HCommit {
  const d = diffFiles(before, files, 0)
  return { hash: s.hash.padEnd(40, '0'), short: s.hash, author: s.author, email: `${s.author}@example.edu`, time: s.ago,
    parents: parent ? [parent.padEnd(40, '0')] : [], tags: s.tags ?? [], branches: [], subject: s.subject, body: s.body,
    files: d.files.map((x) => ({ path: x.path, added: x.added, removed: x.removed })),
    added: d.added, removed: d.removed }
}

function setup() {
  return (ready ??= (async () => {
    const files = await readNow()
    delete files['reply.tex']
    uncommitted(files)
    const chain: Files[] = [{ ...files }]
    for (const s of STEPS) { const f = { ...chain[chain.length - 1] }; s.undo(f); chain.push(f) }
    STEPS.forEach((s, i) => {
      const parent = STEPS[i + 1]?.hash ?? ''
      const c = commitOf(s, parent, chain[i], chain[i + 1])
      snaps.set(c.hash, { c, files: chain[i] })
    })
    snaps.get(STEPS[0].hash.padEnd(40, '0'))!.c.branches = ['main', 'origin/main']
    mainLog = STEPS.map((s) => s.hash.padEnd(40, '0'))
    // reviewer-2-response splits off the second commit
    let base = chain[1], parent = STEPS[1].hash
    const made: string[] = []
    for (const b of [...BRANCH].reverse()) {
      const f = { ...base }
      b.files(f)
      const c = commitOf({ hash: b.hash, ago: b.ago, author: 'jdoe', subject: b.subject, body: b.body }, parent, f, base)
      snaps.set(c.hash, { c, files: f })
      made.unshift(c.hash)
      base = f
      parent = b.hash
    }
    otherLog = [...made, ...mainLog.slice(1)]
    // saved versions: three since the last commit, four before it
    const head = mainLog[0], prev = mainLog[1]
    const extra = 'This matches the lower bound of Section 3 up to a constant.'
    const kinds: [number, string, string, string][] = [[20, 'Saved', 'sections/results.tex', head],
      [31, 'Compiled', 'main.tex', head], [45, 'Saved', 'sections/results.tex', head], [58, 'Saved', 'refs.bib', head],
      [70, 'Compiled', 'main.tex', head], [95, 'Saved', 'main.tex', head], [150, 'Saved', 'main.tex', prev],
      [170, 'Compiled', 'main.tex', prev], [190, 'Saved', 'sections/results.tex', prev], [210, 'Saved', 'main.tex', prev]]
    savedVersions = kinds.map(([mins, kind, file, b], i) => ({ hash: `5a${i}e${(9000 + i * 7).toString(16)}`.padEnd(40, 'c'),
      time: T0 - mins * 60, kind, files: [file], previous: '', base: b }))
    const nowFiles = await readNow()
    savedVersions.forEach((v, i) => {
      const f = { ...nowFiles }
      if (i === 2) f['sections/results.tex'] = f['sections/results.tex'].replace('hides the most.\n', `hides the most.\n${extra}\n`)
      if (v.base === prev) Object.assign(f, snaps.get(prev)!.files)
      savedFiles.set(v.hash, f)
    })
  })())
}

const log = () => (branch === 'main' ? mainLog : otherLog).map((h) => snaps.get(h)!.c)
const headHash = () => (branch === 'main' ? mainLog : otherLog)[0]

async function filesOf(v: string): Promise<Files> {
  if (!v) { const f = await readNow(); if (branch === 'main') delete f['reply.tex']; return f }
  const s = snaps.get(v) ?? [...snaps.values()].find((x) => x.c.short === v)
  if (s) return s.files
  if (savedFiles.has(v)) return savedFiles.get(v)!
  if (v === 'origin/main') return snaps.get(mainLog[0])!.files
  return {}
}

// -- a small diff ---------------------------------------------------------------------------------------------------
function lcs<T>(a: T[], b: T[], eq: (x: T, y: T) => boolean = (x, y) => x === y): [number, number][] {
  const n = a.length, m = b.length, t: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) {
    t[i][j] = eq(a[i], b[j]) ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1])
  }
  const out: [number, number][] = []
  let i = 0, j = 0
  while (i < n && j < m) {
    if (eq(a[i], b[j])) { out.push([i, j]); i++; j++ } else if (t[i + 1][j] >= t[i][j + 1]) i++
    else j++
  }
  return out
}
const TOKEN = /\\[A-Za-z@]+|[A-Za-z]+|[0-9]+|\s+|./g
function words(a: string, b: string): [[number, number][], [number, number][]] {
  const ta = a.match(TOKEN) ?? [], tb = b.match(TOKEN) ?? []
  const pairs = lcs(ta, tb)
  const marks = (tokens: string[], kept: Set<number>) => {
    const out: [number, number][] = []
    let pos = 0
    tokens.forEach((t, i) => {
      if (!kept.has(i) && t.trim()) {
        const last = out[out.length - 1]
        if (last && !tokens.join('').slice(last[1], pos).trim()) last[1] = pos + t.length
        else out.push([pos, pos + t.length])
      }
      pos += t.length
    })
    return out
  }
  return [marks(ta, new Set(pairs.map((p) => p[0]))), marks(tb, new Set(pairs.map((p) => p[1])))]
}
const similar = (a: string, b: string) => {
  const ta = a.match(TOKEN) ?? [], tb = b.match(TOKEN) ?? []
  return (2 * lcs(ta, tb).length) / Math.max(1, ta.length + tb.length)
}
function pair(old: Row[], now: Row[]) {
  let j0 = 0
  for (const r of old) {
    let best = 0.5, hit = -1
    for (let j = j0; j < Math.min(now.length, j0 + 6); j++) { const s = similar(r.t, now[j].t); if (s > best) { best = s; hit = j } }
    if (hit >= 0) { [r.m, now[hit].m] = words(r.t, now[hit].t); j0 = hit + 1 }
  }
}

function diffText(path: string, a: string | undefined, b: string | undefined, context: number): FileDiff | null {
  if (a === b) return null
  const A = a === undefined ? [] : a.replace(/\n$/, '').split('\n'), B = b === undefined ? [] : b.replace(/\n$/, '').split('\n')
  const pairs = lcs(A, B)
  const rows: Row[] = []
  let i = 0, j = 0
  for (const [x, y] of [...pairs, [A.length, B.length] as [number, number]]) {
    while (i < x) rows.push({ k: '-', o: i + 1, n: null, t: A[i++], m: [] })
    while (j < y) rows.push({ k: '+', o: null, n: j + 1, t: B[j++], m: [] })
    if (x < A.length) rows.push({ k: ' ', o: ++i, n: ++j, t: A[x], m: [] })
  }
  const keep = rows.map((_, k) => rows.slice(Math.max(0, k - context), k + context + 1).some((r) => r.k !== ' '))
  const hunks: FileDiff['hunks'] = []
  rows.forEach((r, k) => {
    if (!keep[k]) return
    if (!keep[k - 1] || !hunks.length) hunks.push({ old: r.o ?? (rows.slice(0, k).reverse().find((x) => x.o)?.o ?? 0) + 1,
      new: r.n ?? (rows.slice(0, k).reverse().find((x) => x.n)?.n ?? 0) + 1, header: '', rows: [] })
    hunks[hunks.length - 1].rows.push(r)
  })
  for (const h of hunks) {
    let k = 0
    while (k < h.rows.length) {
      if (h.rows[k].k === ' ') { k++; continue }
      const block: Row[] = []
      while (k < h.rows.length && h.rows[k].k !== ' ') block.push(h.rows[k++])
      pair(block.filter((r) => r.k === '-'), block.filter((r) => r.k === '+'))
    }
  }
  return { path, old_path: a === undefined ? '' : path, status: a === undefined ? 'A' : b === undefined ? 'D' : 'M', binary: false,
    added: rows.filter((r) => r.k === '+').length, removed: rows.filter((r) => r.k === '-').length, hunks }
}

/** Runs of 3 or more removed lines that come back mostly the same elsewhere: one move. */
function moves(files: FileDiff[]): Move[] {
  type Run = { f: FileDiff; h: FileDiff['hunks'][number]; rows: Row[] }
  const runs: Record<'-' | '+', Run[]> = { '-': [], '+': [] }
  for (const f of files) for (const h of f.hunks) {
    let k = 0
    while (k < h.rows.length) {
      const kind = h.rows[k].k
      const run: Row[] = []
      while (k < h.rows.length && h.rows[k].k === kind) run.push(h.rows[k++])
      if (kind !== ' ') runs[kind].push({ f, h, rows: run })
    }
  }
  const out: Move[] = []
  for (const src of runs['-'].filter((r) => r.rows.length >= 3)) {
    const norm = (t: string) => t.trim()
    const dst = runs['+'].find((d) => d.f !== src.f && lcs(src.rows, d.rows, (x, y) => norm(x.t) === norm(y.t)).length
      >= Math.max(3, src.rows.length * 0.6))
    if (!dst) continue
    const id = out.length + 1
    const match = lcs(src.rows, dst.rows, (x, y) => norm(x.t) === norm(y.t))
    const rows: Row[] = []
    let i = 0, j = 0, changes = 0
    for (const [x, y] of [...match, [src.rows.length, dst.rows.length] as [number, number]]) {
      const olds = src.rows.slice(i, x).map((r) => ({ ...r, mv: id, src: true, m: [] as [number, number][] }))
      const news = dst.rows.slice(j, y).map((r) => ({ ...r, mv: id, m: [] as [number, number][] }))
      if (olds.length || news.length) { changes++; pair(olds, news); rows.push(...olds, ...news) }
      if (x < src.rows.length) rows.push({ ...dst.rows[y], o: src.rows[x].o, mv: id, same: true })
      i = x + 1; j = y + 1
    }
    src.rows.forEach((r) => { r.mv = id })
    const at = dst.h.rows.indexOf(dst.rows[0])
    dst.h.rows.splice(at, dst.rows.length, ...rows)
    out.push({ id, lines: src.rows.length, changes, from: { path: src.f.path, line: src.rows[0].o!, end: src.rows[src.rows.length - 1].o! },
      to: { path: dst.f.path, line: dst.rows[0].n!, end: dst.rows[dst.rows.length - 1].n! } })
  }
  return out
}

function diffFiles(a: Files, b: Files, context = 3): Changes {
  const paths = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((p) => p !== 'README.md' || a[p] !== b[p])
  const files = paths.map((p) => diffText(p, a[p], b[p], context)).filter((x): x is FileDiff => !!x)
  const mv = moves(files)
  return { from: '', to: '', files, moves: mv, truncated: false, added: files.reduce((n, f) => n + f.added, 0),
    removed: files.reduce((n, f) => n + f.removed, 0) }
}

// -- the answers --------------------------------------------------------------------------------------------------
async function state(): Promise<GitState> {
  await setup()
  const d = diffFiles(await filesOf(headHash()), await filesOf(''), 0)
  return { root: FOLDER, git_dir: `${FOLDER}/.git`, prefix: '', branch, head: headHash(), upstream: `origin/${branch}`,
    ahead, behind: 0, fetched, user: 'jdoe', email: 'jdoe@example.edu', login: 'jdoe',
    changes: d.files.map((f) => ({ path: f.path, added: f.added, removed: f.removed, new: f.status === 'A' })),
    saved: savedSetting, saved_at: savedVersions[0]?.time ?? 0, syncing: false, remotes: ['origin'] }
}
let savedSetting: GitState['saved'] = 'cluster'

function job(kind: GitJob['kind'], labels: [string, number][], end: () => Promise<{ ok: boolean; result?: unknown; error?: string }>) {
  const id = `demo-${Math.random().toString(16).slice(2, 8)}`
  void (async () => {
    const steps: GitJob['steps'] = []
    const emit = (extra: Partial<GitJob> = {}) => demoEmit('latex-git', { id, cluster: 'wulver', folder: FOLDER, kind,
      steps: steps.map((s) => ({ ...s })), done: false, ...extra })
    await wait(150)
    for (const [label, ms] of labels) {
      if (steps.length) steps[steps.length - 1].done = true
      steps.push({ label, seconds: Math.round(ms / 100) / 10, done: false })
      emit()
      await wait(ms)
    }
    if (steps.length) steps[steps.length - 1].done = true
    emit({ done: true, ...(await end()) })
  })()
  return { id }
}

const spot = (): Spot => ({ path: 'sections/results.tex', index: 0, line: 3,
  end: 7, mine: ['interpolation smooths away~\\cite{rivera2024}, most of all near coasts.'],
  theirs: ['interpolation smooths away~\\cite{rivera2024} in the rain bands.'], base: ['interpolation smooths away~\\cite{rivera2024}.'],
  before: ['Against bilinear interpolation the model lowers the mean error from', '1.9 to 1.6 degrees, and it keeps the sharp edges of rain bands that'],
  after: ['near coasts and mountains, where the coarse grid hides the most.'],
  mine_commit: { hash: mainLog[0].slice(0, 7), subject: snaps.get(mainLog[0])!.c.subject, author: 'jdoe' },
  theirs_commit: { hash: 'f17be20', subject: 'Tighten the results wording', author: 'asmith' } })

let paused: SyncState | null = null

export const answers: Record<string, unknown> = {
  'latex.git_state': state,
  'latex.git_log': async ({ limit = 300 }: { limit?: number }) => { await setup(); return log().slice(0, limit) },
  'latex.git_changes': async ({ frm = '', to = '', context = 3 }: { frm?: string; to?: string; context?: number }) => {
    await setup()
    const f = frm || (to ? snaps.get(to)?.c.parents[0] ?? '' : headHash())
    const before = f ? await filesOf(f) : {}
    const out = diffFiles(before, await filesOf(to), context)
    return { ...out, from: f, to }
  },
  'latex.git_blame': async ({ path }: { path: string }): Promise<Blame> => {
    await setup()
    const rel = path.replace(`${FOLDER}/`, '')
    const order = [...log()].reverse()
    let lines: string[] = [], who: string[] = []
    for (const c of order) {
      const next = (snaps.get(c.hash)!.files[rel] ?? '').replace(/\n$/, '').split('\n')
      const kept = new Map(lcs(lines, next).map(([x, y]) => [y, x]))
      who = next.map((_, j) => kept.has(j) ? who[kept.get(j)!] : c.hash)
      lines = next
    }
    const current = ((await filesOf(''))[rel] ?? '').replace(/\n$/, '').split('\n')
    const kept = new Map(lcs(lines, current).map(([x, y]) => [y, x]))
    const zero = '0'.repeat(40)
    who = current.map((_, j) => kept.has(j) ? who[kept.get(j)!] : zero)
    const commits: Blame['commits'] = { [zero]: { hash: zero, author: 'Not Committed Yet', time: now(), summary: '',
      path: rel, previous: null, uncommitted: true } }
    for (const h of new Set(who)) {
      const c = snaps.get(h)?.c
      if (c) commits[h] = { hash: h, author: c.author, time: c.time, summary: c.subject, path: rel,
        previous: c.parents[0] ? { hash: c.parents[0], path: rel } : null, uncommitted: false }
    }
    return { commits, lines: who.map((h, i) => [h, i + 1]) }
  },
  'latex.git_line': async ({ path, line, at }: { path: string; line: number; at?: string }): Promise<LineStory> => {
    await setup()
    const rel = path.replace(`${FOLDER}/`, '')
    const files = await filesOf(at ?? '')
    const text = (files[rel] ?? '').split('\n')[line - 1]
    const chain = at ? (branch === 'main' ? mainLog : otherLog).slice((branch === 'main' ? mainLog : otherLog).indexOf(at))
      : branch === 'main' ? mainLog : otherLog
    let hit: Snap | null = null
    for (const h of chain) {
      const s = snaps.get(h)!
      const parent = s.c.parents[0] ? snaps.get(s.c.parents[0])!.files[rel] ?? '' : ''
      if ((s.files[rel] ?? '').split('\n').includes(text) && !parent.split('\n').includes(text)) { hit = s; break }
    }
    if (!hit) return { uncommitted: true, line }
    const d = diffText(rel, hit.c.parents[0] ? snaps.get(hit.c.parents[0])!.files[rel] : undefined, hit.files[rel], 0)
    const rows = d?.hunks.flatMap((h) => h.rows) ?? []
    const plus = rows.find((r) => r.k === '+' && r.t === text)
    const minus = plus?.m.length ? rows.filter((r) => r.k === '-' && r.m.length).pop() ?? null : null
    const older = minus && hit.c.parents[0] ? (() => {
      const p = snaps.get(hit.c.parents[0])!
      const ln = (p.files[rel] ?? '').split('\n').indexOf(minus.t) + 1
      const before = [...chain.slice(chain.indexOf(hit.c.hash) + 1)].map((h) => snaps.get(h)!).find((s) => {
        const pp = s.c.parents[0] ? snaps.get(s.c.parents[0])!.files[rel] ?? '' : ''
        return (s.files[rel] ?? '').split('\n').includes(minus.t) && !pp.split('\n').includes(minus.t)
      })
      return before ? { rev: p.c.hash, path: rel, line: ln, hash: before.c.hash, subject: before.c.subject,
        author: before.c.author, time: before.c.time } : null
    })() : null
    const { files: _f, ...c } = hit.c
    void _f
    return { uncommitted: false, commit: c, path: rel, line, rows: [...(minus ? [minus] : []), ...(plus ? [plus] : [])],
      more: Math.max(0, hit.c.added + hit.c.removed - (minus ? 2 : 1)), older }
  },
  'latex.git_refs': async (): Promise<Refs> => {
    await setup()
    const h = (x: string) => snaps.get(x)!.c
    const tag = h(STEPS[4].hash.padEnd(40, '0'))
    return {
      current: branch,
      branches: [
        { name: 'main', hash: mainLog[0], time: h(mainLog[0]).time, author: 'asmith', subject: h(mainLog[0]).subject,
          upstream: 'origin/main', current: branch === 'main', new: branch === 'main' ? 0 : 1 },
        { name: 'reviewer-2-response', hash: otherLog[0], time: h(otherLog[0]).time, author: 'jdoe',
          subject: h(otherLog[0]).subject, upstream: 'origin/reviewer-2-response', current: branch !== 'main',
          new: branch === 'main' ? 3 : 0 },
        { name: 'camera-ready', hash: tag.hash, time: tag.time, author: 'asmith', subject: tag.subject, upstream: '',
          current: false, new: 0 },
      ],
      remote: [{ name: 'origin/main', local: 'main', hash: mainLog[0], time: h(mainLog[0]).time, author: 'asmith',
        subject: h(mainLog[0]).subject }],
      remote_only: [
        { name: 'origin/asmith/tighter-bound', local: 'asmith/tighter-bound', hash: mainLog[2], time: at(0, 8, 2),
          author: 'asmith', subject: 'Tighten the error bound' },
        { name: 'origin/jdoe/appendix-cut', local: 'jdoe/appendix-cut', hash: mainLog[3], time: at(8, 15, 30),
          author: 'jdoe', subject: 'Cut the appendix' },
      ],
      tags: [{ name: 'v1-arxiv', hash: tag.hash, time: tag.time, author: 'jdoe', subject: tag.subject }],
      last_pull: { hash: mainLog[1], time: fetched },
      mine: { hash: mainLog[1], time: h(mainLog[1]).time, subject: h(mainLog[1]).subject },
    }
  },
  'latex.git_lanes': async ({ a, b }: { a: string; b: string }): Promise<Lanes> => {
    await setup()
    return { base: mainLog[1], a, b, only_a: [snaps.get(mainLog[0])!.c], only_b: otherLog.slice(0, 3).map((h) => snaps.get(h)!.c) }
  },
  'latex.git_file': async ({ at: v, path }: { at: string; path: string }) => ({ text: (await filesOf(v))[path] ?? '' }),
  'latex.git_sync_lines': async ({ path, lines }: { path: string; lines: number[] }) =>
    Promise.all(lines.map((line) => demoCall<{ page: number; x: number; y: number } | null>('latex.sync_view',
      { path, line }).then((s) => s && { line, ...s }))),
  'latex.git_switch_check': async ({ target }: { target: string }): Promise<SwitchCheck> => {
    const st = await state()
    const name = target.replace(/^origin\//, '')
    return { from: branch, target: name, remote_only: name.includes('/'), files: name === 'main' || branch !== 'main' ? 2 : 3,
      changes: st.changes, clash: [], bring: true }
  },
  'latex.git_switch': async ({ target, mode }: { target: string; mode: string }) => {
    const st = await state()
    const name = target.replace(/^origin\//, '')
    const n = st.changes.length
    return job('switch', [...(n ? [[`Made a safe copy of your ${n} ${n === 1 ? 'change' : 'changes'}`, 300]] as [string, number][] : []),
      ['Got the latest from origin', 900], ['Updating 3 files', 1600]], async () => {
      const from = branch
      branch = name === 'main' ? 'main' : 'reviewer-2-response'
      if (branch !== 'main') await demoCall('latex.write', { path: `${FOLDER}/reply.tex`, text: REPLY })
      else await demoCall('latex.delete', { path: `${FOLDER}/reply.tex` }).catch(() => null)
      return { ok: true, result: { branch: name, from, brought: mode === 'bring' ? n : 0, kept: mode === 'keep' ? n : 0, back: '' } }
    })
  },
  'latex.git_new_branch': ({ name }: { name: string }) => name,
  'latex.git_commit': async ({ message, only }: { message: string; only?: string[] }) => {
    await setup()
    const parent = headHash()
    const files = { ...(only ? await filesOf(parent) : {}), ...await filesOf('') }
    if (only) {
      const all = await filesOf(''), before = await filesOf(parent)
      for (const p of new Set([...Object.keys(all), ...Object.keys(before)])) {
        if (only.includes(p)) { if (p in all) files[p] = all[p]; else delete files[p] } else if (p in before) files[p] = before[p]
        else delete files[p]
      }
    }
    const hash = Math.random().toString(16).slice(2, 9)
    const [subject, ...rest] = message.split('\n')
    const c = commitOf({ hash, ago: now(), author: 'jdoe', subject, body: rest.join('\n').trim() }, parent, files,
      await filesOf(parent))
    snaps.set(c.hash, { c, files })
    if (branch === 'main') mainLog.unshift(c.hash)
    else otherLog.unshift(c.hash)
    ahead++
    return `[${branch} ${hash}] ${subject}`
  },
  'latex.git_commit_split': async ({ commits }: { commits: { message: string; files: string[] }[] }) => {
    const commit = answers['latex.git_commit'] as (p: { message: string; only?: string[] }) => Promise<string>
    for (const [i, c] of commits.entries()) await commit({ message: c.message, only: i < commits.length - 1 ? c.files : undefined })
    return { commits: commits.length }
  },
  'latex.git_sync': async ({ push }: { push: boolean }) => {
    const st = await state()
    const n = st.changes.length
    const aside: [string, number][] = n ? [[`Put your ${n} ${n === 1 ? 'change' : 'changes'} not committed yet aside`, 250]] : []
    if (push && ahead && pushTries++ === 0) {
      return job('push', [...aside, ['Get the latest from origin', 1300]], async () => {
        paused = { push: true, stage: 'pull', branch, upstream: `origin/${branch}`, remote: 'origin', pulled: 1,
          pulled_by: 'asmith', pulled_at: now() - 600, changes: n, pushed: 0, spots: [spot()] }
        return { ok: true, result: paused }
      })
    }
    return job(push ? 'push' : 'pull', [...aside, ['Get the latest from origin', 1100],
      ...(push && ahead ? [[`Push your ${ahead} ${ahead === 1 ? 'commit' : 'commits'}`, 900]] as [string, number][] : []),
      ...(n ? [['Bring your changes back', 200]] as [string, number][] : [])], async () => {
      const pushed = push ? ahead : 0
      if (push) ahead = 0
      fetched = now()
      return { ok: true, result: { done: true, push, branch, pulled: 0, pulled_by: '', pushed, back: n } }
    })
  },
  'latex.git_sync_state': () => paused,
  'latex.git_settle': () => (paused = paused && { ...paused, spots: [] }),
  'latex.git_sync_continue': async () => {
    const n = paused?.changes ?? 0
    paused = null
    return job('push', [['Push your 1 commit', 900], ...(n ? [['Bring your changes back', 200]] as [string, number][] : [])],
      async () => { const pushed = ahead; ahead = 0; fetched = now()
        return { ok: true, result: { done: true, push: true, branch, pulled: 1, pulled_by: 'asmith', pushed, back: n } } })
  },
  'latex.git_sync_stop': () => { paused = null; return { stopped: true, kept: false } },
  'latex.git_saved': async () => { await setup(); return savedVersions },
  'latex.git_save_version': () => ({ saved: '', why: 'same' }),
  'latex.git_saved_setting': ({ mode }: { mode: GitState['saved'] }) => (savedSetting = mode),
  'latex.git_restore': async ({ version }: { version: string }) => {
    const f = await filesOf(version)
    for (const [p, text] of Object.entries(f)) await demoCall('latex.write', { path: `${FOLDER}/${p}`, text })
    return { before: '' }
  },
  'latex.git_put_back': async ({ path, line, expect, lines }: { path: string; line: number; expect: string[]; lines: string[] }) => {
    const full = `${FOLDER}/${path}`
    const rows = (await demoCall<{ text: string }>('latex.read', { path: full })).text.split('\n')
    if (rows.slice(line - 1, line - 1 + expect.length).join('\n') !== expect.join('\n')) {
      throw new Error('The file changed there since. Open it in the Editor to change it by hand.')
    }
    rows.splice(line - 1, expect.length, ...lines)
    await demoCall('latex.write', { path: full, text: rows.join('\n') })
    return null
  },
  'latex.git_pdf': async ({ version = '', against }: { version?: string; against?: string | null }) => {
    const id = `pdf-${Math.random().toString(16).slice(2, 8)}`
    const path = `${FOLDER}/.git/hpc-hub/pdf/${against != null ? `diff-${against}-` : ''}${version || 'now'}.pdf`
    if (pdfs.has(path)) return { path }
    void (async () => {
      const started = performance.now()
      await wait(1800)
      const files = await filesOf(version)
      const { typeset } = await import('./latexPdf')
      const out = against != null ? null : typeset({ ...files, 'refs.bib': files['refs.bib'] ?? '' }, 'main.tex')
      if (out?.ok) pdfs.set(path, out.pdf)
      demoEmit('latex-git-pdf', { id, cluster: 'wulver', folder: FOLDER, ok: !!out?.ok, path: out?.ok ? path : '',
        error: against != null ? 'latexdiff is not on Wulver (NJIT). Add it to the build setup (for example module load '
          + 'texlive) or ask your cluster\'s admins for it.' : out?.ok ? '' : 'That version did not compile.',
        seconds: Math.round((performance.now() - started) / 100) / 10 + 39 })
    })()
    return { id }
  },
  'latex.chunk': async (p: { path: string; offset?: number; length?: number }) => {
    const bytes = pdfs.get(p.path)
    if (!bytes) return (latex['latex.chunk'] as (x: typeof p) => unknown)(p)
    const { offset = 0, length = 4 << 20 } = p
    let s = ''
    const part = bytes.subarray(offset, offset + length)
    for (let i = 0; i < part.length; i += 0x8000) s += String.fromCharCode(...part.subarray(i, i + 0x8000))
    return { data: btoa(s), total: bytes.length }
  },
}

