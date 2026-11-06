import { useCallback, useEffect, useState, type ReactNode } from 'react'

import { call } from '../../rpc'
import type { Cluster, Session } from '../../types'
import type { State } from '../../types/clusters'
import { useToast } from '../useToast'
import { Button, Dialog, Spinner } from '../ui'
import { inTauri } from './platform'

const BUSY: State[] = ['Connecting VPN', 'Signing in', 'Approve Duo on your phone', 'Requesting compute node',
  'Disconnecting']
const IDLE: State[] = ['Disconnected', 'Error']
const ASK_MS = 2000  // a backend that does not answer never keeps the window open
const DISCONNECT_MS = 60_000

type Named = { id: string; name: string }
let quitting = false

async function sessions(keep: (s: Session) => boolean): Promise<Named[]> {
  const late = new Promise<Named[]>((ok) => setTimeout(() => ok([]), ASK_MS))
  const list = Promise.all([call<Cluster[]>('clusters.list'), call<Session[]>('sessions.list')]).then(([cs, ss]) =>
    ss.filter(keep).map((s) => ({ id: s.id, name: cs.find((c) => c.id === s.id)?.name ?? s.id })))
  return Promise.race([list.catch(() => []), late])
}
const busy = () => sessions((s) => BUSY.includes(s.state))
const active = () => sessions((s) => !IDLE.includes(s.state))
const names = (list: Named[]) => list.map((s) => s.name).join(', ')

/** Quit, the menu's two quits, and the question when the window is closed during a login. */
export function useQuit() {
  const toast = useToast()
  const [dialog, setDialog] = useState<ReactNode>(null)
  const close = useCallback(() => setDialog(null), [])

  const end = useCallback(async () => {
    quitting = true
    if (!inTauri) { setDialog(null); toast('Quitting works in the app'); quitting = false; return }
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    await getCurrentWindow().destroy()
  }, [toast])

  const askBusy = useCallback((list: Named[]) => setDialog(
    <Dialog title="Still connecting" onClose={close} width={420} actions={<>
      <Button onClick={close}>Keep it open</Button>
      <Button kind="primary" onClick={() => {
        Promise.all(list.map((s) => call('clusters.cancel', { cluster: s.id }).catch(() => {}))).finally(end)
      }}>Quit</Button>
    </>}>
      <p>{names(list)} {list.length > 1 ? 'are' : 'is'} still signing in. Quit anyway? Everything already connected
        keeps running.</p>
    </Dialog>), [close, end])

  const quit = useCallback(async () => {
    const list = await busy()
    if (list.length) askBusy(list)
    else await end()
  }, [askBusy, end])

  const disconnectAndQuit = useCallback(async () => {
    const list = await active()
    if (!list.length) { await end(); return }
    const go = async () => {
      setDialog(<Dialog title="Disconnecting" onClose={() => {}} width={420}
        actions={<Button onClick={end}>Quit now</Button>}>
        <div className="flex items-center gap-3"><Spinner size={20} /><p>{names(list)}</p></div>
      </Dialog>)
      await Promise.all(list.map((s) => call('clusters.disconnect', { cluster: s.id }).catch(() => {})))
      const until = Date.now() + DISCONNECT_MS
      while (Date.now() < until && (await active()).length) await new Promise((ok) => setTimeout(ok, 500))
      await end()
    }
    setDialog(
      <Dialog title="Disconnect everything and quit?" onClose={close} width={460} actions={<>
        <Button onClick={close}>Keep running</Button>
        <Button kind="danger-solid" onClick={go}>Disconnect and quit</Button>
      </>}>
        <p>{names(list)}: the VPN goes down and the nodes HPC Hub got for you are released. Anything running on
          them stops. Jobs you started yourself and VS Code jobs keep running.</p>
      </Dialog>)
  }, [close, end])

  // The window's close button (ours, or the system's on macOS) and Alt+F4
  useEffect(() => {
    if (!inTauri) return
    let stop: (() => void) | undefined
    let gone = false
    import('@tauri-apps/api/window').then(({ getCurrentWindow }) => getCurrentWindow().onCloseRequested(async (e) => {
      if (quitting) return
      const list = await busy()
      if (list.length) { e.preventDefault(); askBusy(list) }
      else quitting = true
    })).then((un) => { if (gone) un(); else stop = un })
    return () => { gone = true; stop?.() }
  }, [askBusy])

  return { quit, disconnectAndQuit, dialog }
}
