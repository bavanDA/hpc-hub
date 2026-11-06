import { useRef } from 'react'

import { call } from '../../rpc'
import type { Clip, Entry, Transfer } from '../../types/files'
import { useToast } from '../toast'
import { join } from './format'
import { useLocalFiles } from './local'
import { memory } from './memory'
import { finishedMessage, startedMessage } from './messages'
import type { How } from './PasteDialog'
import { useTransfers } from './useTransfers'

/** Copies in and out of the folder: uploads, downloads and pastes, refreshing it when one lands here. */
export function useCopies({ cluster, here, path, connected, refresh }: {
  cluster: string; here: string; path: string; connected: boolean; refresh: () => void
}) {
  const toast = useToast()
  const dests = useRef(new Map<string, { cluster: string; dir: string }>())
  const local = useLocalFiles(cluster, here)

  const upload = () => {
    if (!connected || !path) return
    const into = { cluster, dir: path }
    local.upload(path).then((id) => id && dests.current.set(id, into))
  }
  const download = (e: Entry) => local.download(join(path, e.name))

  const transfers = useTransfers((t: Transfer) => {
    if (!local.finished(t)) toast(finishedMessage(t))
    const d = dests.current.get(t.id)
    if (!t.error && d && d.cluster === memory.cluster && d.dir === memory.paths[d.cluster]) refresh()
  })

  const start = (c: Clip, skip: string[], how: How, total: number) => {
    const into = { cluster, dir: path }
    call<{ id: string }>('files.copy', { src_cluster: c.cluster, src_path: c.path, dst_cluster: cluster,
      dst_dir: path, skip, how, folder: c.folder, total })
      .then(({ id }) => { dests.current.set(id, into); toast(startedMessage(c.cluster === cluster, how, c.name)) })
      .catch((e: Error) => toast(`Could not start: ${e.message}`))
  }

  return { local, upload, download, transfers, start }
}
