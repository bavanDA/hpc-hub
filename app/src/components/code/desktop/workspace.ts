/** The folder open on the Code page per cluster ('' for none), and the folders opened before it. */
const OPEN = 'code.folder.'
const RECENT = 'code.recent.'
const KEEP = 8

function read(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}

function write(key: string, value: string) {
  try { localStorage.setItem(key, value) } catch { /* private window */ }
}

/** The folder open last time on this cluster, '' for none. */
export const openFolder = (cluster: string) => read(OPEN + cluster) ?? ''

export function recentFolders(cluster: string): string[] {
  try { return JSON.parse(read(RECENT + cluster) ?? '[]') as string[] } catch { return [] }
}

/** Remember path as open on cluster ('' closes it); an opened folder goes to the top of the recent ones. */
export function rememberFolder(cluster: string, path: string) {
  write(OPEN + cluster, path)
  if (path) write(RECENT + cluster, JSON.stringify([path, ...recentFolders(cluster).filter((p) => p !== path)]
    .slice(0, KEEP)))
}
