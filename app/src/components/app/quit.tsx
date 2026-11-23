import { useCallback, useEffect, useState, type ReactNode } from 'react'

import { call } from '../../rpc'
import type { Cluster, Session } from '../../types'
import type { State } from '../../types/clusters'
import { AlertDialog } from '../ui/AlertDialog'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { Spinner } from '../ui/Spinner'
import { useToast } from '../useToast'
import { inTauri } from './platform'

const BUSY: State[] = ['Connecting VPN', 'Signing in', 'Approve Duo on your phone', 'Requesting compute node',
  'Disconnecting']
const IDLE: State[] = ['Disconnected', 'Error']
const ASK_MS = 2000  // a backend that does not answer never keeps the window open
const DISCONNECT_MS = 60_000
const INFO_MS = 3000  // what a reset removes, for its question: shown without it when the backend is slow
const RESET_MS = 60_000

/** p, or an Error saying what after ms. */
const within = <T,>(p: Promise<T>, ms: number, what: string) =>
  Promise.race([p, new Promise<T>((_, no) => setTimeout(() => no(new Error(what)), ms))])

type Named = { id: string; name: string }
const KEPT = ['Your SSH keys and known hosts (~/.ssh)', 'Your files and jobs on the clusters']
type ResetInfo = { folders: string[]; clusters: string[]; kept: string[] }
const isWindows = navigator.userAgent.includes('Windows')
const isMac = navigator.userAgent.includes('Mac')
const needsHelper = isWindows || isMac  // the VPN helper is a system service there
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

  // Settings > Reset HPC Hub and Uninstall HPC Hub: asked first, every cluster disconnected, then the backend
  // forgets the logins (and starts the uninstall), and the window quits; the folders go once it has closed.
  // The question shows at once: what the backend lists comes into it when it answers (it once waited for that
  // answer first, so a slow backend showed nothing at all: 2026-11-22, "I click on this and still nothing happened").
  const resetAndQuit = useCallback(async (kind: 'reset' | 'uninstall') => {
    let erase = true
    let open = true  // the question is still up
    const run = async () => {
      open = false
      setDialog(<Dialog title={kind === 'reset' ? 'Resetting' : 'Uninstalling'} onClose={() => {}} width={420}>
        <div className="flex items-center gap-3"><Spinner size={20} /><p>Disconnecting and removing…</p></div>
      </Dialog>)
      const list = await active()
      await Promise.all(list.map((s) => call('clusters.disconnect', { cluster: s.id }).catch(() => {})))
      const until = Date.now() + DISCONNECT_MS
      while (list.length && Date.now() < until && (await active()).length) await new Promise((ok) => setTimeout(ok, 500))
      try {
        await within(call(kind === 'reset' ? 'app.reset' : 'app.uninstall', kind === 'reset' ? {} : { erase }), RESET_MS,
          "HPC Hub's background part didn't answer. Quit HPC Hub, start it again and try once more.")
      } catch (e) {
        setDialog(<Dialog title={kind === 'reset' ? 'Could not reset' : 'Could not uninstall'} onClose={close}
          width={440} actions={<Button kind="primary" onClick={close}>OK</Button>}>
          <p>{(e as Error).message}</p></Dialog>)
        return
      }
      await end()
    }
    const shut = () => { open = false; close() }
    const ask = (info: ResetInfo | null) => {
      const what = <>
        <p className="pt-1 text-sm">Removed from this computer:</p>
        <ul className="list-disc pl-5 text-sm">
          <li>Saved logins: passwords{info?.clusters.length ? ` for ${info.clusters.join(', ')}` : ''}, VPN and
            Globus</li>
          <li>Settings, projects list, logs and sign-in cookies
            {info?.folders.length ? <span className="block font-mono text-xs text-dim">{info.folders.join('  ')}</span>
              : null}</li>
        </ul>
        <p className="pt-3 text-sm text-dim">Kept: {(info?.kept ?? KEPT).join('; ')}.</p>
      </>
      setDialog(kind === 'reset'
        ? <AlertDialog title="Reset HPC Hub?" keep="Keep everything" act="Reset and quit" onAct={run} onClose={shut}>
            <p>HPC Hub signs out of every cluster and forgets everything it saved, as if newly installed. Start it
              again to set it up.</p>
            {what}
          </AlertDialog>
        : <AlertDialog title="Uninstall HPC Hub?" keep="Keep HPC Hub" act="Uninstall" onAct={run} onClose={shut}>
            <p>HPC Hub disconnects, quits and removes itself
              {isWindows ? ' (Windows then shows its uninstaller)' : isMac ? ' (it goes to the Trash)' : ''}.
              {needsHelper ? ' Its VPN helper is removed too, which asks for your permission.' : ''}</p>
            <label className="mt-1 flex items-start gap-2 text-text">
              <input type="checkbox" defaultChecked className="mt-1" onChange={(e) => { erase = e.target.checked }} />
              <span>Also remove my saved logins and data</span>
            </label>
            {what}
          </AlertDialog>)
    }
    ask(null)
    const info = await within(call<ResetInfo>('app.reset_info'), INFO_MS, 'no answer').catch(() => null)
    if (open && info) ask(info)
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

  return { quit, disconnectAndQuit, resetAndQuit, dialog }
}
