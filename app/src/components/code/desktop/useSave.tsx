import type { ReactNode } from 'react'

import { call } from '../../../rpc'
import type { OpenedFile } from '../../../types/code'
import { AlertDialog, Button, Dialog } from '../../ui'
import { useToast } from '../../useToast'
import { getFile, isDirty, reloadFile, replaceText, saveFile, type OpenFile } from '../store'
import { CompareDialog } from './Compare'

/** Saving the current file, and what to do when the cluster's copy changed under it. */
export function useSave({ current, name, dropBanner, setDialog, close }: {
  current: string | null; name: (cluster: string) => string; dropBanner: (key: string) => void
  setDialog: (d: ReactNode) => void; close: () => void
}) {
  const toast = useToast()

  async function save(force = false): Promise<boolean> {
    const f = current ? getFile(current) : null
    if (!f || (!isDirty(f) && !force)) return true
    const r = await saveFile(f.key, force)
    if (r.saved) { dropBanner(f.key); return true }
    if (r.conflict) conflict(f)
    else toast(`Couldn't save ${f.name}: ${r.error}`, { kind: 'error' })
    return false
  }

  const compare = async (f: OpenFile, after: 'merge' | 'keep') => {
    try {
      const theirs = await call<OpenedFile>('code.open', { cluster: f.cluster, path: f.path })
      const mine = f.text
      setDialog(<CompareDialog title={`${f.name}: the cluster's version and yours`} path={f.path} base={theirs.text}
        mine={mine} note="Changes in green are yours. Reject the ones you don't want, then use the result."
        useLabel={after === 'merge' ? 'Use this' : 'Use this and save'} onClose={close}
        onUse={async (text) => {
          await reloadFile(f.key)         // the cluster's version becomes the base…
          replaceText(f.key, text)        // …and your picked changes go on top
          dropBanner(f.key)
          if (after === 'keep') await save()
        }} />)
    } catch (e) {
      toast(`Couldn't read ${f.name}: ${(e as Error).message}`, { kind: 'error' })
    }
  }

  const takeTheirs = (f: OpenFile) => setDialog(
    <AlertDialog title={`Throw away your edits to ${f.name}?`} keep="Keep editing" act={`Use ${name(f.cluster)}'s`}
      onClose={close} onAct={() => { close(); void reloadFile(f.key); dropBanner(f.key) }}>
      The file goes back to the version on {name(f.cluster)}.</AlertDialog>)

  function conflict(f: OpenFile) {
    setDialog(
      <Dialog title={`${f.name} changed on ${name(f.cluster)}`} onClose={close} width={460} actions={<>
        <Button onClick={() => { close(); void compare(f, 'keep') }}>Compare</Button>
        <Button onClick={() => takeTheirs(f)}>Use {name(f.cluster)}'s</Button>
        <Button onClick={() => { close(); void save(true) }}>Save mine</Button>
      </>}>
        <p className="text-dim">It changed while you were editing. Save mine writes over the cluster's version.</p>
      </Dialog>)
  }

  return { save, compare, takeTheirs }
}
