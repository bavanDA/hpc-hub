// Demo data for the LaTeX page: a made-up paper (main.tex, a section, refs.bib, figures) that really builds into
// a PDF in the browser, with SyncTeX, a build log, issues and a git history.
import type {
  BuildDone, GitInfo, LatexProject, Opened, Paper, Picker, Settings, SourceSpot, Spot, TreeEntry,
} from '../types/latex'

const now = Math.floor(Date.now() / 1000)
const DAY = 86400
const FOLDER = '/home/jdoe/papers/sparse-downscaling'

const MAIN = String.raw`\documentclass[10pt]{article}
\usepackage{amsmath,graphicx}
\usepackage{hyperref}

\title{Sparse Attention for Regional Climate Downscaling}
\author{Jane Doe and Alex Rivera}
\date{\today}

\begin{document}
\maketitle

\begin{abstract}
We train a sparse attention model that turns coarse climate model output into
station scale temperature and rainfall. On ten years of made-up station data
it lowers the error by 18\% against bilinear interpolation, and it trains on
one GPU node in under six hours.
\end{abstract}

\section{Introduction}\label{sec:intro}
Global climate models run on grids of about 100 km, while farms, cities and
rivers need answers at the scale of a single station. Statistical
downscaling bridges that gap by learning how coarse fields map to local
observations~\cite{doe2023}.

Attention models do this well but grow with the square of the number of grid
cells. We keep only the cells that matter for each station, which makes the
cost close to linear and lets the whole model fit on a single node of the
cluster (Section~\ref{sec:method}).

\section{Method}\label{sec:method}
Each station attends to the $k$ nearest coarse cells and to a small set of
learned global tokens. The loss is the mean squared error with a smoothness
penalty on neighbouring stations:
\begin{equation}\label{eq:loss}
L = \frac{1}{N} \sum_i (y_i - f(x_i))^2 + \lambda \sum_{i \sim j} (f(x_i) - f(x_j))^2
\end{equation}
We use $k = 32$ and $\lambda = 0.1$ for every run.

\subsection{Training}
Models train for 40 epochs with AdamW on one GPU. The loss in
Equation~\ref{eq:loss} drops quickly in the first ten epochs and then settles,
as Figure~\ref{fig:loss} shows.

\begin{figure}[t]
\centering
\includegraphics[width=0.8\linewidth]{figures/loss.png}
\caption{Training and validation loss per epoch on the station data.}\label{fig:loss}
\end{figure}

\input{sections/results}

\bibliographystyle{plain}
\bibliography{refs}
\end{document}
`

const RESULTS = String.raw`\section{Results}\label{sec:results}
Against bilinear interpolation the model lowers the mean error from
1.9 to 1.6 degrees, and it keeps the sharp edges of rain bands that
interpolation smooths away~\cite{rivera2024}. The gains are largest
near coasts and mountains, where the coarse grid hides the most.

\begin{itemize}
\item Temperature error drops by 18\% on held out stations.
\item Rainfall timing improves on 7 of 10 test years.
\item One run takes 5.4 hours on a single GPU node.
\end{itemize}

\section{Conclusion}
Sparse attention gives station scale answers at the cost of a single
node. Code and configs are in the project folder on the cluster.
`

const BIB = `@article{doe2023,
  author = {Jane Doe and Sam Lee},
  title = {Learning to downscale coarse climate fields},
  journal = {Journal of Made Up Climate Studies},
  year = {2023}
}

@article{rivera2024,
  author = {Alex Rivera and Jane Doe},
  title = {Keeping the edges of rain bands in downscaled fields},
  journal = {Made Up Letters on Weather},
  year = {2024}
}

@inproceedings{lee2022,
  author = {Sam Lee},
  title = {Station data for everyone},
  booktitle = {Workshop on Open Data},
  year = {2022}
}
`

const files: Record<string, string> = {
  'main.tex': MAIN, 'sections/results.tex': RESULTS, 'refs.bib': BIB,
  'README.md': '# Sparse downscaling paper\n\nBuild with latexmk on Wulver.\n',
}
const extra = ['figures/loss.png', 'figures/architecture.pdf', 'figures/stations.png', 'data/stations.csv']
const folders = new Set<string>()
let tree: TreeEntry[] = []
function retree() {
  const all = [...Object.keys(files), ...extra]
  const dirs = new Set([...folders, ...all.flatMap((p) => p.split('/').slice(0, -1)
    .map((_, i, a) => a.slice(0, i + 1).join('/')))])
  tree = [...[...dirs].map((path) => ({ kind: 'd' as const, path })), ...all.map((path) => ({ kind: 'f' as const, path }))]
    .sort((a, b) => a.path.localeCompare(b.path))
}
retree()

const rel = (path: string) => path.startsWith(FOLDER + '/') ? path.slice(FOLDER.length + 1) : path.split('/').pop()!

let settings: Settings = { setup: 'module load texlive/2024', engine: 'pdf', on_node: true }

const projects: LatexProject[] = [
  { id: `wulver:${FOLDER}`, name: 'sparse-downscaling', cluster: 'wulver', cluster_name: 'Wulver (NJIT)', path: FOLDER,
    main_tex: 'main.tex', opened: now - 3600 },
  { id: 'wulver:/home/jdoe/thesis', name: 'thesis', cluster: 'wulver', cluster_name: 'Wulver (NJIT)',
    path: '/home/jdoe/thesis', main_tex: 'thesis.tex', opened: now - 3 * DAY },
  { id: 'yale:/home/jdoe/posters/agu-2026', name: 'agu-2026', cluster: 'yale', cluster_name: 'Yale Bouchet',
    path: '/home/jdoe/posters/agu-2026', main_tex: 'poster.tex', opened: now - 12 * DAY },
]
const papers: Paper[] = [
  { cluster: 'wulver', cluster_name: 'Wulver (NJIT)', folder: '/mmfs1/scratch/mygroup/jdoe/drafts/rebuttal',
    main: 'main.tex', mtime: now - 2 * DAY, others: 0, short: 'scratch/drafts/rebuttal', title: 'drafts / rebuttal' },
  { cluster: 'wulver', cluster_name: 'Wulver (NJIT)', folder: '/home/jdoe/notes/reading-group', main: 'notes.tex',
    mtime: now - 9 * DAY, others: 2, short: '~/notes/reading-group', title: 'notes / reading-group' },
  { cluster: 'yale', cluster_name: 'Yale Bouchet', folder: '/home/jdoe/proposals/nsf-2026', main: 'proposal.tex',
    mtime: now - 30 * DAY, others: 0, short: '~/proposals/nsf-2026', title: 'proposals / nsf-2026' },
]

// -- the build: typeset in the browser -------------------------------------------------------------------------
type Built = Awaited<ReturnType<typeof build>>
let built: Promise<Built> | null = null
let mtime = now - 3600
async function build() {
  const { typeset } = await import('../components/latex/demoPdf')
  return typeset(files, 'main.tex')
}
let pdfBytes: Promise<Uint8Array> | null = null
const current = () => (built ??= build())
const pdf = () => (pdfBytes ??= current().then((b) => b.pdf))

function base64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function runBuild(): Promise<{ id: string; done: BuildDone }> {
  const started = performance.now()
  const result = await build()
  await wait(900)
  built = Promise.resolve(result)
  if (result.ok) { pdfBytes = Promise.resolve(result.pdf); mtime = Math.floor(Date.now() / 1000) }
  return { id: 'demo-build', done: { id: 'demo-build', cluster: 'wulver', main: `${FOLDER}/main.tex`, ok: result.ok,
    code: result.ok ? 0 : 12, stopped: false, seconds: Math.round((performance.now() - started) / 100) / 10 + 2.1,
    issues: result.issues, log: result.log } }
}

async function syncView({ path, line }: { path: string; line: number }): Promise<Spot | null> {
  const here = (await current()).placed.filter((p) => p.file === rel(path))
  if (!here.length) return null
  const best = here.reduce((a, b) => Math.abs(b.line - line) < Math.abs(a.line - line) ? b : a)
  return { page: best.page, x: best.x, y: best.y }
}

async function syncEdit({ page, x, y }: { page: number; x: number; y: number }): Promise<SourceSpot | null> {
  const here = (await current()).placed.filter((p) => p.page === page)
  if (!here.length) return null
  const best = here.reduce((a, b) => Math.abs(b.y - y) * 4 + Math.abs(b.x - x) < Math.abs(a.y - y) * 4 +
    Math.abs(a.x - x) ? b : a)
  return { path: `${FOLDER}/${best.file}`, line: best.line }
}

const git: GitInfo = {
  root: FOLDER, branch: 'main',
  remotes: [{ name: 'origin', url: 'git@github.com:jdoe/sparse-downscaling.git' }],
  changes: [{ status: 'M', path: 'main.tex' }, { status: 'M', path: 'sections/results.tex' },
    { status: '??', path: 'figures/stations.png' }],
  history: [
    ['a41c9e2', 2, 'Jane Doe', 'Results: add rainfall timing'], ['9be0d17', 3, 'Alex Rivera', 'Fix the loss equation'],
    ['5f2a8c4', 5, 'Jane Doe', 'Training details and loss figure'], ['e07b3d1', 8, 'Jane Doe', 'Method section'],
    ['c19f650', 11, 'Alex Rivera', 'Introduction and related work'], ['31d8a0b', 14, 'Jane Doe', 'First outline'],
  ].map(([hash, ago, author, subject]) => ({ hash: hash as string, author: author as string, subject: subject as string,
    date: new Date((now - (ago as number) * DAY) * 1000).toISOString().slice(0, 10) })),
}

function opened({ path }: { path: string }): Opened {
  const p = projects.find((x) => path === x.path || path.startsWith(x.path + '/'))
  return { cluster: p?.cluster ?? 'wulver', cluster_name: p?.cluster_name ?? 'Wulver (NJIT)',
    name: p?.name ?? 'sparse-downscaling', folder: FOLDER, main: `${FOLDER}/main.tex`, tree, settings }
}

function move(from: string, to: string) {
  const a = rel(from), b = rel(to)
  for (const k of Object.keys(files)) {
    if (k === a || k.startsWith(a + '/')) { files[b + k.slice(a.length)] = files[k]; delete files[k] }
  }
  extra.forEach((k, i) => { if (k === a || k.startsWith(a + '/')) extra[i] = b + k.slice(a.length) })
  retree()
  return to
}

export const answers: Record<string, unknown> = {
  'latex.picker': (): Picker => ({
    clusters: [{ id: 'wulver', name: 'Wulver (NJIT)', connected: true }, { id: 'yale', name: 'Yale Bouchet',
      connected: true }, { id: 'sdsc', name: 'SDSC Expanse', connected: false }],
    projects, papers, found_at: { wulver: now - 2 * 3600, yale: now - DAY },
  }),
  'latex.scan': async ({ cluster }: { cluster: string }) => {
    await wait(1200)
    return papers.filter((p) => p.cluster === cluster)
  },
  'latex.forget': null,
  'latex.open': opened,
  'latex.set_main': null,
  'latex.tree': () => tree,
  'latex.read': ({ path }: { path: string }) => {
    const text = files[rel(path)]
    if (text === undefined) throw new Error('Not a text file')
    return { text }
  },
  'latex.write': ({ path, text }: { path: string; text: string }) => { files[rel(path)] = text; retree(); return null },
  'latex.new_file': ({ into, name }: { into: string; name: string }) => {
    const r = [into === FOLDER ? '' : rel(into), name].filter(Boolean).join('/')
    files[r] = ''
    retree()
    return `${FOLDER}/${r}`
  },
  'latex.mkdir': ({ into, name }: { into: string; name: string }) => {
    const r = [into === FOLDER ? '' : rel(into), name].filter(Boolean).join('/')
    folders.add(r)
    retree()
    return `${FOLDER}/${r}`
  },
  'latex.move': ({ path, into }: { path: string; into: string }) =>
    move(path, `${into || FOLDER}/${path.split('/').pop()}`),
  'latex.rename': ({ path, name }: { path: string; name: string }) =>
    move(path, `${path.slice(0, path.lastIndexOf('/'))}/${name}`),
  'latex.delete': ({ path }: { path: string }) => {
    const a = rel(path)
    for (const k of Object.keys(files)) if (k === a || k.startsWith(a + '/')) delete files[k]
    for (let i = extra.length - 1; i >= 0; i--) if (extra[i] === a || extra[i].startsWith(a + '/')) extra.splice(i, 1)
    retree()
    return null
  },
  'latex.pdf': async ({ main }: { main: string }) => {
    const bytes = await pdf()
    return bytes.length ? { path: main.replace(/\.tex$/, '.pdf'), size: bytes.length, mtime } : null
  },
  'latex.chunk': async ({ offset = 0, length = 4 << 20 }: { offset?: number; length?: number }) => {
    const bytes = await pdf()
    return { data: base64(bytes.subarray(offset, offset + length)), total: bytes.length }
  },
  'latex.settings': () => settings,
  'latex.save_settings': (s: Settings) => (settings = { setup: s.setup, engine: s.engine, on_node: s.on_node }),
  'latex.build': runBuild,
  'latex.stop': null,
  'latex.sync_view': syncView,
  'latex.sync_edit': syncEdit,
  'latex.git_info': () => git,
  'latex.git_commit': ({ message }: { message: string }) => {
    git.history.unshift({ hash: Math.random().toString(16).slice(2, 9), date: new Date().toISOString().slice(0, 10),
      author: 'Jane Doe', subject: message })
    git.changes = []
    return `[main ${git.history[0].hash}] ${message}`
  },
  'latex.git_pull': async () => { await wait(700); return 'Already up to date.' },
  'latex.git_push': async () => { await wait(900); return 'To github.com:jdoe/sparse-downscaling.git' },
  'latex.git_show': ({ commit }: { commit: string }) => {
    const c = git.history.find((x) => x.hash === commit)
    return `commit ${commit}1f0e3b9a2c\nAuthor: ${c?.author} <jdoe@example.edu>\nDate:   ${c?.date}\n\n    ${
      c?.subject}\n\n main.tex | 6 ++++--\n 1 file changed, 4 insertions(+), 2 deletions(-)\n\ndiff --git a/main.tex ` +
      `b/main.tex\n--- a/main.tex\n+++ b/main.tex\n@@ -31,7 +31,9 @@\n-We use $k = 16$.\n+We use $k = 32$ and ` +
      `$\\lambda = 0.1$ for every run.\n`
  },
}
