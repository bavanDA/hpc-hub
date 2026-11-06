import type { Entry, Sort } from '../../types/files'

const ARCHIVES = ['.zip', '.tar.gz', '.tgz', '.tar', '.tar.bz2', '.tar.xz']
const IMAGES = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp']
export const TEXT = ['.txt', '.md', '.py', '.sh', '.tex', '.bib', '.sty', '.cls', '.json', '.yaml', '.yml', '.toml',
  '.cfg', '.ini', '.csv', '.tsv', '.log', '.out', '.err', '.c', '.h', '.cpp', '.hpp', '.cu', '.java', '.js', '.ts',
  '.r', '.jl', '.m', '.slurm', '.sbatch', '.bashrc', '.conf', '.xml', '.html', '.css', '.rs', '.go', '']
export const EDIT_LIMIT = 8 * 1024 * 1024
export const MEDIA_LIMIT = 60 * 1024 * 1024

export const isDir = (e: Entry) => e.kind === 'd'

/** Lower-case extension, keeping .tar.gz and friends whole; dotfiles like .bashrc count as their own. */
export function ext(name: string): string {
  const low = name.toLowerCase()
  for (const multi of ['.tar.gz', '.tar.bz2', '.tar.xz']) if (low.endsWith(multi)) return multi
  const dot = low.lastIndexOf('.')
  return dot > 0 ? low.slice(dot) : ''
}

export type Kind = 'folder' | 'text' | 'code' | 'image' | 'pdf' | 'archive' | 'data' | 'other'
const CODE = ['.py', '.sh', '.c', '.h', '.cpp', '.hpp', '.cu', '.java', '.js', '.ts', '.r', '.jl', '.m', '.slurm',
  '.sbatch', '.rs', '.go', '.html', '.css', '.xml', '.json', '.ipynb', '.yaml', '.yml', '.toml', '.tex']
const DATA = ['.csv', '.tsv', '.h5', '.hdf5', '.nc', '.npy', '.npz', '.parquet', '.pkl', '.pt', '.ckpt', '.mat']

export function kind(e: Entry): Kind {
  if (isDir(e)) return 'folder'
  const x = ext(e.name)
  if (x === '.pdf') return 'pdf'
  if (IMAGES.includes(x)) return 'image'
  if (ARCHIVES.includes(x)) return 'archive'
  if (DATA.includes(x)) return 'data'
  if (CODE.includes(x)) return 'code'
  if (TEXT.includes(x)) return 'text'
  return 'other'
}

export const isText = (e: Entry) => !isDir(e) && TEXT.includes(ext(e.name))
export const isArchive = (e: Entry) => !isDir(e) && ARCHIVES.includes(ext(e.name))

/** 12 bytes, 2 kB, 1.2 MB: powers of 1000, no ".0". */
export function size(n: number): string {
  if (n < 1000) return `${n} byte${n === 1 ? '' : 's'}`
  const units = ['kB', 'MB', 'GB', 'TB', 'PB']
  let v = n / 1000, u = 0
  while (v >= 1000 && u < units.length - 1) { v /= 1000; u++ }
  return `${v >= 100 ? Math.round(v) : +v.toFixed(1)} ${units[u]}`
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Today: 14:05. This year: Mar 3. Older: Mar 3 2023. */
export function when(mtime: number): string {
  const d = new Date(mtime * 1000), now = new Date()
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  if (d.toDateString() === now.toDateString()) return time
  const day = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return d.getFullYear() === now.getFullYear() ? `${day} ${time}` : `${day} ${d.getFullYear()}`
}

/** Folders first, then by the column, reversed when desc. */
export function sorted(entries: Entry[], sort: Sort): Entry[] {
  const key = (e: Entry): string | number =>
    sort.key === 'name' ? e.name.toLowerCase() : sort.key === 'size' ? (isDir(e) ? -1 : e.size) : e.mtime
  return [...entries].sort((a, b) => {
    if (isDir(a) !== isDir(b)) return isDir(a) ? -1 : 1
    const x = key(a), y = key(b)
    const c = x < y ? -1 : x > y ? 1 : 0
    return sort.desc ? -c : c
  })
}

export function join(dir: string, name: string): string {
  return dir.endsWith('/') ? dir + name : `${dir}/${name}`
}

export function parent(path: string): string {
  const p = path.replace(/\/+$/, '')
  const i = p.lastIndexOf('/')
  return i <= 0 ? '/' : p.slice(0, i)
}

export const basename = (path: string) => path.replace(/\/+$/, '').split('/').pop() || path
