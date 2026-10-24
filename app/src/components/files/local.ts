// Upload and download with the system's file dialogs. Progress shows below with the copies (`transfer` events);
// files.download to "HPC Hub" in Downloads, then open, is how files without a preview open.
import { useCallback } from 'react'

import { call } from '../../rpc'
import type { Transfer } from '../../types/files'
import { inTauri } from '../app/platform'
import { useToast } from '../toast'

type Mine = { kind: 'upload' | 'download'; path?: string; open?: boolean }

const HERE = 'this computer'  // in the titles of files_local.py
const mine = new Map<string, Mine>()  // kept across visits to the page
const early = new Map<string, Transfer>()  // finished before files.upload/download answered with its id

async function pickFiles(title: string): Promise<string[]> {
  if (!inTauri) return ['/home/jdoe/Documents/notes.txt']  // design preview
  const { open } = await import('@tauri-apps/plugin-dialog')
  return (await open({ title, multiple: true })) ?? []
}

async function pickFolder(title: string): Promise<string | null> {
  if (!inTauri) return '/home/jdoe/Downloads'
  const { open } = await import('@tauri-apps/plugin-dialog')
  const { downloadDir } = await import('@tauri-apps/api/path')
  return open({ title, directory: true, defaultPath: await downloadDir().catch(() => undefined) })
}

async function openFolder(cluster: string): Promise<string> {
  if (!inTauri) return `/home/jdoe/Downloads/HPC Hub/${cluster}`
  const { downloadDir, join } = await import('@tauri-apps/api/path')
  return join(await downloadDir(), 'HPC Hub', cluster)
}

const base = (p: string) => p.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || p

export function useLocalFiles(cluster: string, clusterName: string) {
  const toast = useToast()

  const report = useCallback((t: Transfer, m: Mine) => {
    const word = m.kind === 'upload' ? 'Upload' : 'Download'
    if (t.error) {
      toast(t.error === 'Cancelled' ? `${word} cancelled` : `${word} failed: ${t.error}`)
    } else if (m.kind === 'upload') {
      toast(`Uploaded ${t.title.split(':')[0]}`)
    } else if (m.open && m.path && inTauri) {
      import('@tauri-apps/plugin-opener').then(({ openPath }) => openPath(m.path!))
        .catch((e: Error) => toast(`Saved to ${m.path}. Could not open it: ${e.message ?? e}`))
    } else {
      toast(`Saved to ${m.path}`)
    }
  }, [toast])

  const started = useCallback((id: string, m: Mine) => {
    mine.set(id, m)
    const t = early.get(id)
    if (t) { early.delete(id); report(t, m) }
  }, [report])

  /** Ask for files and upload them into dir; answers the transfer's id. */
  const upload = useCallback(async (dir: string): Promise<string | null> => {
    const paths = await pickFiles(`Upload to ${clusterName}:${dir}`)
    if (!paths.length) return null
    try {
      const { id } = await call<{ id: string }>('files.upload', { cluster, local_paths: paths, remote_dir: dir })
      started(id, { kind: 'upload' })
      toast(`Uploading ${paths.length === 1 ? base(paths[0]) : `${paths.length} items`}. Progress is below`)
      return id
    } catch (e) {
      toast(`Could not upload: ${(e as Error).message}`)
      return null
    }
  }, [cluster, clusterName, started, toast])

  /** Download to a folder you pick, or with open: to Downloads/HPC Hub/<cluster>, then open it. */
  const download = useCallback(async (path: string, open = false) => {
    const name = base(path)
    const dir = open ? await openFolder(cluster) : await pickFolder(`Download ${name} to`)
    if (!dir) return
    try {
      const got = await call<{ id: string; path: string }>('files.download',
        { cluster, remote_path: path, local_dir: dir })
      started(got.id, { kind: 'download', path: got.path, open })
      toast(open ? `Downloading ${name} to open it…` : `Downloading ${name}. Progress is below`)
    } catch (e) {
      toast(`Could not download: ${(e as Error).message}`)
    }
  }, [cluster, started, toast])

  /** For the page's onFinished: true when it was an upload or download (and said so). */
  const finished = useCallback((t: Transfer) => {
    if (!t.title.includes(HERE)) return false
    const m = mine.get(t.id)
    if (m) { mine.delete(t.id); report(t, m) } else early.set(t.id, t)
    return true
  }, [report])

  return { upload, download, finished }
}
