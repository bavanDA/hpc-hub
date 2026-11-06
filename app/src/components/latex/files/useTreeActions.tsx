import type { ReactNode } from 'react'

import { call } from '../../../rpc'
import type { TreeEntry } from '../../../types/latex'
import { ConfirmDialog } from '../../files/ConfirmDialog'
import { ImageDialog } from '../../files/ImageDialog'
import { NameDialog } from '../../files/NameDialog'
import { PdfDialog } from '../../pdf/PdfDialog'
import { useToast } from '../../useToast'
import { basename, ext, IMAGE_EXT, TEXT_EXT } from '../bits'
import type { TreeActions } from './FileTree'

type Args = {
  cluster: string
  folder: string
  clusterName: string
  tree: TreeEntry[]
  refresh: () => void
  edit: (path: string) => void  // open a text file in the editor
  moved: (from: string, to: string) => void  // a file or folder has a new path
  removed: (path: string) => void
  setMain: (path: string) => void
  dialog: (d: ReactNode) => void
}

/** What the file tree's menus and drags do, on the cluster. Paths in and out of the tree are relative. */
export function useTreeActions(a: Args): TreeActions {
  const toast = useToast()
  const { cluster, folder } = a
  const where = { cluster, folder }
  const abs = (r: string) => r ? `${folder}/${r}` : folder
  const close = () => a.dialog(null)
  const failed = (e: Error) => toast(`Failed: ${e.message}`)
  const top = (into: string) => into || 'the top folder'
  return {
    open: (r) => {
      const x = ext(r), p = abs(r)
      if (IMAGE_EXT.includes(x)) a.dialog(<ImageDialog cluster={cluster} path={p} onClose={close} />)
      else if (x === '.pdf') a.dialog(<PdfDialog cluster={cluster} path={p} subtitle={r} onClose={close} />)
      else if (TEXT_EXT.includes(x)) a.edit(p)
      else toast(`${basename(r)} can't be opened here`)
    },
    move: (r, into) => call<string>('latex.move', { ...where, path: abs(r), into: abs(into) })
      .then((to) => { a.moved(abs(r), to); a.refresh(); toast(`Moved ${basename(r)} to ${top(into)}`) })
      .catch(failed),
    newFile: (into) => a.dialog(<NameDialog title={`New file in ${top(into)}`} action="Create"
      initial="" onClose={close} onDone={(name) => call<string>('latex.new_file', { ...where, into: abs(into), name })
        .then((p) => { a.refresh(); if (TEXT_EXT.includes(ext(p))) a.edit(p) }).catch(failed)} />),
    newFolder: (into) => a.dialog(<NameDialog title={`New folder in ${top(into)}`} action="Create"
      onClose={close} onDone={(name) => call('latex.mkdir', { ...where, into: abs(into), name })
        .then(() => { a.refresh(); toast(`Created ${name}`) }).catch(failed)} />),
    rename: (r) => a.dialog(<NameDialog title={`Rename ${basename(r)}`} action="Rename" initial={basename(r)}
      onClose={close} onDone={(name) => call<string>('latex.rename', { ...where, path: abs(r), name })
        .then((to) => { a.moved(abs(r), to); a.refresh(); toast(`Renamed to ${name}`) }).catch(failed)} />),
    remove: (r) => a.dialog(<ConfirmDialog title={`Delete ${basename(r)}?`} action="Delete" onClose={close}
      text={`It is removed from ${a.clusterName}${a.tree.some((e) => e.path === r && e.kind === 'd')
        ? ' with everything inside.' : '.'}`}
      onYes={() => call('latex.delete', { ...where, path: abs(r) }).then(() => {
        a.refresh()
        toast(`Deleted ${basename(r)}`)
        a.removed(abs(r))
      }).catch(failed)} />),
    setMain: (r) => call('latex.set_main', { ...where, main: abs(r) })
      .then(() => { a.setMain(abs(r)); toast(`Main file: ${basename(r)}`) }).catch(failed),
    copyPath: (r) => navigator.clipboard.writeText(abs(r)).then(() => toast(`Copied ${abs(r)}`))
      .catch(() => toast('Could not copy')),
    refresh: a.refresh,
  }
}
