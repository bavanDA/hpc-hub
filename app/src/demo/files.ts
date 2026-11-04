// Demo data for the Files page: a made-up home folder on every cluster, and two copies in the list.
import type { CopyPlan, Entry, FileData, Listing, Place, Transfer } from '../types/files'

const now = Math.floor(Date.now() / 1000)
const HOUR = 3600, DAY = 24 * HOUR
const HOME = '/home/jdoe'
const THESIS = '/mmfs1/project/mygroup/jdoe/thesis'

const d = (name: string, age: number): Entry => ({ name, kind: 'd', size: 4096, mtime: now - age })
const f = (name: string, size: number, age: number): Entry => ({ name, kind: 'f', size, mtime: now - age })

const TREE: Record<string, Entry[]> = {
  [HOME]: [
    d('data', 3 * DAY), d('envs', 40 * DAY), d('notebooks', 2 * HOUR), d('projects', 5 * HOUR),
    d('slurm-logs', 20 * 60), d('.cache', 9 * DAY), f('.bashrc', 1_204, 120 * DAY), f('README.md', 2_310, 6 * DAY),
    f('train.py', 8_942, 35 * 60), f('run_job.sbatch', 612, 50 * 60), f('loss_curve.png', 184_220, 3 * HOUR),
    f('paper_draft.pdf', 2_481_903, 2 * DAY), f('results.tar.gz', 1_532_884_112, 4 * DAY),
    f('slurm-123456.out', 48_311, 12 * 60), f('environment.yml', 734, 40 * DAY), f('metrics.csv', 96_120, 3 * HOUR),
  ],
  [`${HOME}/projects`]: [
    d('climate-model', 5 * HOUR), d('protein-fold', 12 * DAY), d('thesis', 400 * DAY), f('notes.txt', 3_120, DAY),
  ],
  [`${HOME}/projects/climate-model`]: [
    d('src', 5 * HOUR), d('data', 2 * DAY), d('results', 6 * HOUR), d('checkpoints', 6 * HOUR),
    f('train.py', 1_204, 30 * 60), f('run.slurm', 702, 5 * HOUR), f('README.md', 1_845, 9 * DAY),
    f('config.yaml', 1_310, 5 * HOUR),
  ],
  [`${HOME}/notebooks`]: [f('explore.ipynb', 412_004, 2 * HOUR), f('plots.ipynb', 1_204_331, 3 * DAY)],
  [`${HOME}/slurm-logs`]: Array.from({ length: 8 }, (_, i) =>
    f(`slurm-12345${i}.out`, 2_000 + i * 731, (i + 1) * 3 * HOUR)),
  [`${HOME}/data`]: [d('raw', 30 * DAY), d('processed', 3 * DAY), f('stations.csv', 5_812_331, 30 * DAY)],
  [`${HOME}/envs`]: [d('torch', 40 * DAY), d('jax', 60 * DAY)],
  [`${HOME}/.cache`]: [],
  [THESIS]: [
    d('src', 2 * HOUR), d('data', 6 * DAY), d('results', 40 * 60), d('slurm-logs', 25 * 60),
    f('README.md', 1_845, 9 * DAY), f('train.py', 1_204, 30 * 60), f('run.slurm', 702, 5 * HOUR),
    f('config.yaml', 1_310, 5 * HOUR), f('environment.yml', 734, 40 * DAY),
  ],
  [`${THESIS}/src`]: [f('model.py', 6_120, 2 * HOUR), f('data.py', 3_410, DAY), f('metrics.py', 1_980, 3 * DAY)],
  [`${THESIS}/data`]: [d('raw', 30 * DAY), d('processed', 6 * DAY)],
  [`${THESIS}/results`]: [f('metrics.csv', 96_120, 40 * 60), f('loss_curve.png', 184_220, 40 * 60)],
  [`${THESIS}/slurm-logs`]: [f('slurm-123456.out', 48_311, 12 * 60), f('slurm-123455.out', 12_904, 3 * HOUR)],
  [`${HOME}/paper`]: [d('figures', 2 * DAY), f('main.tex', 18_204, 3 * HOUR), f('refs.bib', 9_310, 4 * DAY)],
  '/project/mygroup/jdoe': [d('shared-data', 20 * DAY), d('models', 8 * DAY), f('ACCESS.md', 420, 200 * DAY)],
  '/scratch/jdoe': [d('tmp-run-0412', 6 * HOUR), f('big_output.h5', 48_210_993_112, 6 * HOUR)],
}

const TEXTS: Record<string, string> = {
  'README.md': `# Climate model runs

Runs for the regional climate model on Wulver.

## Layout

- \`data/\` raw station data and processed grids
- \`projects/climate-model/\` the model, configs and results
- \`slurm-logs/\` output of every job

## Run

    sbatch run_job.sbatch

Results land in \`results/\`, one folder per run.
`,
  'train.py': `"""Train the downscaling model on one GPU."""

import argparse
from pathlib import Path

import torch
from torch.utils.data import DataLoader

from model import Downscaler
from data import StationDataset


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--epochs", type=int, default=40)
    p.add_argument("--batch", type=int, default=64)
    p.add_argument("--out", type=Path, default=Path("results"))
    args = p.parse_args()

    device = "cuda" if torch.cuda.is_available() else "cpu"
    data = DataLoader(StationDataset("data/processed"), batch_size=args.batch, shuffle=True)
    model = Downscaler().to(device)
    opt = torch.optim.AdamW(model.parameters(), lr=3e-4)

    for epoch in range(args.epochs):
        for x, y in data:
            loss = model.loss(x.to(device), y.to(device))
            opt.zero_grad()
            loss.backward()
            opt.step()
        print(f"epoch {epoch} loss {loss.item():.4f}")

    args.out.mkdir(exist_ok=True)
    torch.save(model.state_dict(), args.out / "model.pt")


if __name__ == "__main__":
    main()
`,
  'run_job.sbatch': `#!/bin/bash
#SBATCH --job-name=downscale
#SBATCH --partition=gpu
#SBATCH --gres=gpu:1
#SBATCH --cpus-per-task=8
#SBATCH --mem=32G
#SBATCH --time=12:00:00
#SBATCH --account=mygroup

module load cuda
source ~/envs/torch/bin/activate
python train.py --epochs 40
`,
  'slurm-123456.out': Array.from({ length: 40 }, (_, i) =>
    `epoch ${i} loss ${(1.8 * Math.exp(-i / 9) + 0.12).toFixed(4)}`).join('\n') + '\n',
  'metrics.csv': 'epoch,loss,val_loss\n' + Array.from({ length: 30 }, (_, i) =>
    `${i},${(1.8 * Math.exp(-i / 9) + 0.12).toFixed(4)},${(1.9 * Math.exp(-i / 10) + 0.15).toFixed(4)}`).join('\n'),
  'environment.yml': 'name: torch\nchannels:\n  - conda-forge\ndependencies:\n  - python=3.12\n  - pytorch\n'
    + '  - xarray\n',
  '.bashrc': '# .bashrc\nexport PATH="$HOME/.local/bin:$PATH"\nalias sq="squeue -u $USER"\n',
}

function chart(): string {
  const pts = Array.from({ length: 40 }, (_, i) => `${20 + i * 9},${200 - 160 * Math.exp(-i / 9)}`).join(' ')
  const val = Array.from({ length: 40 }, (_, i) => `${20 + i * 9},${195 - 150 * Math.exp(-i / 10)}`).join(' ')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="240" viewBox="0 0 400 240">
<rect width="400" height="240" fill="#ffffff"/>
<g stroke="#e6e6e9">${[60, 100, 140, 180].map((y) => `<line x1="20" x2="380" y1="${y}" y2="${y}"/>`).join('')}</g>
<polyline points="${pts}" fill="none" stroke="#3584e4" stroke-width="3"/>
<polyline points="${val}" fill="none" stroke="#e66100" stroke-width="3" stroke-dasharray="6 4"/>
<text x="20" y="28" font-family="sans-serif" font-size="15" font-weight="bold" fill="#333">Loss per epoch</text>
<text x="300" y="28" font-family="sans-serif" font-size="12" fill="#3584e4">train</text>
<text x="340" y="28" font-family="sans-serif" font-size="12" fill="#e66100">val</text>
</svg>`
  return btoa(svg)
}

function list({ path = '' }: { path?: string }): Listing {
  const p = !path || path === '~' ? HOME : path.replace(/^~/, HOME).replace(/(.)\/+$/, '$1')
  const entries = TREE[p]
  if (!entries) throw new Error(`find: '${p}': No such file or directory`)
  return { path: p, entries }
}

function read({ path }: { path: string }): FileData {
  const name = path.split('/').pop() ?? ''
  if (/\.(png|jpe?g|gif|svg|webp)$/i.test(name)) {
    return { kind: 'image', mime: 'image/svg+xml', size: 1, data: chart(), cut: false }
  }
  const text = TEXTS[name] ?? `${name}\n\nMade-up content for the demo.\n`
  return { kind: 'text', mime: 'text/plain', size: text.length, text, cut: false }
}

const places: Place[] = [
  { label: 'Home', path: HOME }, { label: 'Project', path: '/project/mygroup/jdoe' },
  { label: 'Scratch', path: '/scratch/jdoe' },
]

const plan: CopyPlan = {
  sizes: [{ name: 'checkpoints', size: 18_402_331_904 }, { name: 'data', size: 2_204_113_920 },
    { name: 'results', size: 412_330_112 }, { name: 'src', size: 1_204_331 }, { name: 'config.yaml', size: 1_310 },
    { name: 'README.md', size: 1_845 }, { name: 'run.slurm', size: 702 }],
  total: 21_020_985_124,
}

const transfers: Transfer[] = [
  { id: 'demo1', title: 'climate-model: Wulver → Yale:/home/jdoe/projects', how: 'laptop',
    done: 1_804_331_008, total: 4_210_993_112, status: '', finished: false, error: '' },
  { id: 'demo2', title: 'results: Wulver → SDSC:/expanse/lustre/projects/abc123/jdoe · Globus',
    how: 'globus', done: 1204, total: 1204, status: 'Done · 12.4 GB · 1204 files', finished: true, error: '' },
]

export const answers: Record<string, unknown> = {
  'files.list': list, 'files.places': places, 'files.read': read, 'files.copy_plan': plan,
  'files.real_path': ({ path }: { path: string }) => path,
  'files.transfers': transfers, 'files.copy': { id: 'demo3' }, 'files.write': null, 'files.mkdir': null,
  'files.rename': null, 'files.delete': null, 'files.zip': null, 'files.extract': null,
  'files.cancel_transfer': null,
}
