// Demo data for the Code page: a few made-up files you can open, edit and save in the browser preview. One file
// "changes on the cluster" after a while, to show the change banner and a save conflict.
import type { FileState, FoundFile, GrepHit, OpenedFile, SaveResult } from '../types/code'
import type { FileData, Listing } from '../types/files'
import { answers as files } from './files'

const HOME = '/home/jdoe'
const now = () => Math.floor(Date.now() / 1000)

const FILES: Record<string, string> = {
  [`${HOME}/projects/climate-model/train.py`]: `import torch
from model import ClimateNet

LR = 0.001
EPOCHS = 30


def main():
    net = ClimateNet()
    opt = torch.optim.Adam(net.parameters(), lr=LR)
    for epoch in range(EPOCHS):
        loss = net.step(opt)
        print(f"epoch {epoch}: loss {loss:.4f}")


if __name__ == "__main__":
    main()
`,
  [`${HOME}/projects/climate-model/run.slurm`]: `#!/bin/bash
#SBATCH --job-name=climate
#SBATCH --partition=general
#SBATCH --cpus-per-task=4
#SBATCH --mem=16G
#SBATCH --time=04:00:00

module load python
python train.py
`,
  [`${HOME}/projects/climate-model/config.yaml`]: `data: ~/data/processed
batch_size: 64
seed: 7
`,
  [`${HOME}/projects/climate-model/README.md`]: `# Climate model

Train with \`sbatch run.slurm\`. Results land in \`results/\`.
`,
  [`${HOME}/slurm-123456.out`]: Array.from({ length: 40 }, (_, i) => `epoch ${i}: loss ${(1 / (i + 1)).toFixed(4)}\n`)
    .join('') + `Traceback (most recent call last):
  File "${HOME}/projects/climate-model/train.py", line 12, in main
    loss = net.step(opt)
RuntimeError: CUDA out of memory
`,
}

const state: Record<string, { text: string; sha: string; mtime: number }> = {}
let version = 0
const shaOf = (text: string) => `demo${(++version).toString(16).padStart(8, '0')}${text.length.toString(16)}`
const full = (path: string) => path.replace(/^~/, HOME)

// a job's output from the Jobs demo (any folder, slurm-<id>.out) reads like the log above
const jobLog = (p: string) => /\/slurm-\d+\.(out|err)$/.test(p) ? FILES[`${HOME}/slurm-123456.out`] : undefined

// any other text file the Files demo lists opens with the text Files shows for it
function listed(p: string): string | undefined {
  const at = p.lastIndexOf('/')
  try {
    const { entries } = (files['files.list'] as (a: { path: string }) => Listing)({ path: p.slice(0, at) || '/' })
    if (!entries.some((e) => e.kind === 'f' && e.name === p.slice(at + 1))) return undefined
    const data = (files['files.read'] as (a: { path: string }) => FileData)({ path: p })
    return data.kind === 'text' ? data.text : undefined
  } catch {
    return undefined
  }
}

function get(path: string) {
  const p = full(path)
  const text = FILES[p] ?? jobLog(p) ?? listed(p)
  if (!state[p] && text !== undefined) state[p] = { text, sha: shaOf(text), mtime: now() - 3600 }
  return state[p]
}

function opened(path: string): OpenedFile {
  const f = get(path)
  if (!f) throw new Error('No such file')
  const log = /\.(out|err|log)$/.test(path)
  return {
    path, text: f.text, sha: f.sha, mtime: f.mtime, size: new TextEncoder().encode(f.text).length, eol: 'lf',
    writable: !log, readonly_reason: log ? 'No write permission' : '', lossy: false,
  }
}

// After a minute, an "agent" adds a line to train.py, so the preview shows what happens then
setTimeout(() => {
  const f = get(`${HOME}/projects/climate-model/train.py`)
  if (f) Object.assign(f, { text: f.text.replace('EPOCHS = 30', 'EPOCHS = 30\nWARMUP = 2'), mtime: now() })
  if (f) f.sha = shaOf(f.text)
}, 60_000)

/** The file as the demo cluster has it now (for the demo agent's answer). */
export function current(path: string): { text: string; sha: string } | undefined {
  return get(path)
}

export const answers = {
  'code.open': ({ path }: { path: string }): OpenedFile => opened(path),
  'code.save': ({ path, text, base_sha, force }: { path: string; text: string; base_sha: string; force?: boolean }):
    SaveResult => {
    const f = get(path)
    if (f && f.sha !== base_sha && !force) return { saved: false, conflict: true, sha: f.sha, mtime: f.mtime }
    const next = { text, sha: shaOf(text), mtime: now() }
    state[full(path)] = next
    return { saved: true, sha: next.sha, mtime: next.mtime }
  },
  'code.stat': ({ paths }: { paths: string[] }): FileState[] => paths.map((path) => {
    const f = get(path)
    return f ? { path, exists: true, sha: f.sha, mtime: f.mtime, size: f.text.length }
      : { path, exists: false, sha: '', mtime: 0, size: 0 }
  }),
  'code.new_file': ({ path, text }: { path: string; text?: string }): OpenedFile => {
    if (get(path)) throw new Error('A file with that name exists')
    state[full(path)] = { text: text ?? '', sha: shaOf(text ?? ''), mtime: now() }
    return opened(path)
  },
  'code.find_files': ({ root, query }: { root: string; query?: string }): FoundFile[] => {
    const q = (query ?? '').toLowerCase()
    return Object.keys(FILES).filter((p) => p.startsWith(full(root || '~')))
      .map((path) => ({ path, name: path.slice(path.lastIndexOf('/') + 1) }))
      .filter((f) => f.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.length - b.name.length || a.path.localeCompare(b.path))
  },
  'code.grep': ({ root, text }: { root: string; text: string }): GrepHit[] => {
    const needle = text.toLowerCase()
    if (!needle.trim()) return []
    return Object.keys(FILES).filter((p) => p.startsWith(full(root || '~'))).flatMap((path) =>
      (get(path)?.text ?? '').split('\n').flatMap((line, i) =>
        line.toLowerCase().includes(needle) ? [{ path, line: i + 1, text: line.slice(0, 300) }] : []))
  },
}
