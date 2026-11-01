// Files between the cluster and this phone. Upload: Android's picker copies the files into the app's cache, then
// files.upload sends them. Download: files.download into the cache, then, once the copy is done, into
// Downloads/HPC Hub, or opened or shared from there. Progress shows with the other copies (`transfer` events);
// the finish is watched here, outside React, so leaving the Files screen doesn't lose it.
import { call, on } from '@shared/rpc'
import type { Transfer } from '@shared/types/files'
import { openWith, pickFiles, saveToDownloads, share } from '../native'

type Then = 'save' | 'open' | 'share'

const CACHE = '~/.cache/hpc-hub/downloads'  // the backend's home is the app's private folder
const waiting = new Map<string, { path: string; name: string; then: Then }>()
const early = new Map<string, Transfer>()  // finished before files.download answered with its id
let notify: (text: string) => void = () => {}

/** The screen that shows messages for uploads and downloads (the last one mounted). */
export const setLocalNotify = (fn: (text: string) => void) => { notify = fn }

const failed = (e: unknown) => String((e as Error)?.message ?? e)

async function landed(t: Transfer, w: { path: string; name: string; then: Then }) {
  if (t.error) {
    notify(t.error === 'Cancelled' ? 'Download cancelled' : `Download failed: ${t.error}`)
    return
  }
  try {
    if (w.then === 'share') await share({ path: w.path, title: w.name })
    else if (w.then === 'open') await openWith(w.path)
    else notify(`Saved ${w.name} in ${await saveToDownloads(w.path, w.name)}`)
  } catch (e) {
    notify(failed(e))
  }
}

const stop = on('transfer', (d) => {
  const t = d as Transfer
  if (!t.finished) return
  const w = waiting.get(t.id)
  if (w) { waiting.delete(t.id); landed(t, w) } else early.set(t.id, t)
})
import.meta.hot?.dispose(stop)

/** Copy a file or folder to this phone, then save it in Downloads, open it, or share it. */
export async function download(cluster: string, path: string, then: Then = 'save') {
  const name = path.replace(/\/+$/, '').split('/').pop() || path
  try {
    const got = await call<{ id: string; path: string }>('files.download',
      { cluster, remote_path: path, local_dir: CACHE })
    const w = { path: got.path, name, then }
    const t = early.get(got.id)
    if (t) { early.delete(got.id); landed(t, w) } else waiting.set(got.id, w)
    notify(then === 'save' ? `Downloading ${name}` : `Getting ${name} first`)
  } catch (e) {
    notify(`Could not download ${name}: ${failed(e)}`)
  }
}

/** Pick files on this phone and upload them into dir. */
export async function upload(cluster: string, dir: string) {
  try {
    const picked = await pickFiles({ multiple: true })
    if (!picked.length) return
    await call('files.upload', { cluster, local_paths: picked.map((p) => p.path), remote_dir: dir })
    notify(`Uploading ${picked.length === 1 ? picked[0].name : `${picked.length} files`}`)
  } catch (e) {
    notify(failed(e))
  }
}
