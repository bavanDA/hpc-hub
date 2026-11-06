export const basename = (p: string) => p.replace(/\/+$/, '').split('/').pop() || p
export const dirname = (p: string) => p.slice(0, Math.max(0, p.lastIndexOf('/'))) || '/'
export const rel = (folder: string, p: string) => p.startsWith(folder + '/') ? p.slice(folder.length + 1) : p
export const inFolder = (folder: string, r: string) => r ? `${folder}/${r}` : folder
export const under = (path: string, top: string) => path === top || path.startsWith(top + '/')
/** Where path ends up when top moves to to, or null when it is not under top. */
export const moved = (path: string, top: string, to: string) => under(path, top) ? to + path.slice(top.length) : null
export const short = (p: string) => p.replace(/^(?:\/mmfs1)?\/home\/[^/]+/, '~')

/** 5 minutes ago, 3 days ago, Mar 3 2024. */
export function ago(ts: number): string {
  if (!ts) return ''
  const s = Date.now() / 1000 - ts
  const n = (v: number, u: string) => `${Math.floor(v)} ${u}${Math.floor(v) === 1 ? '' : 's'} ago`
  if (s < 60) return 'just now'
  if (s < 3600) return n(s / 60, 'minute')
  if (s < 86400) return n(s / 3600, 'hour')
  if (s < 30 * 86400) return n(s / 86400, 'day')
  return new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export const TEXT_EXT = ['.tex', '.bib', '.sty', '.cls', '.bst', '.txt', '.md', '.csv', '.dat', '.py', '.sh', '.cfg',
  '.json', '.yaml', '.yml', '.tikz', '.bbx', '.cbx', '.lua', '.r', '.m', '.gitignore', '.latexmkrc', '']
export const IMAGE_EXT = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp']

/** ".tex" for "main.tex", ".gitignore" for ".gitignore", "" for "Makefile". */
export function ext(name: string): string {
  const b = basename(name).toLowerCase()
  const dot = b.lastIndexOf('.')
  return dot > 0 ? b.slice(dot) : b.startsWith('.') ? b : ''
}
