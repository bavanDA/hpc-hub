// Files, Transfers: the desktop's Transfers tab on a phone (app/src/pages/Globus.tsx). Copies through this phone on
// top, then the two Globus panes stacked, so the Transfer arrows point down and up, then the recent transfers. Stopping
// a running transfer asks first.
import { ArrowDown, ArrowUp, CircleAlert, RefreshCw, Settings } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

import { shortName } from '@shared/components/clusters/loginCopy'
import { join } from '@shared/components/files/format'
import { useTransfers } from '@shared/components/files/useTransfers'
import { CollectionPicker } from '@shared/components/globus/CollectionPicker'
import { SettingsDialog } from '@shared/components/globus/SettingsDialog'
import { SetUp } from '@shared/components/globus/SetUp'
import { SignIn } from '@shared/components/globus/SignIn'
import { TaskRow } from '@shared/components/globus/TaskRow'
import { usePane, type Pane as PaneState } from '@shared/components/globus/usePane'
import { useTasks } from '@shared/components/globus/useTasks'
import { Button as UiButton } from '@shared/components/ui/Button'
import { EmptyState } from '@shared/components/ui/EmptyState'
import { List } from '@shared/components/ui/List'
import { Spinner } from '@shared/components/ui/Spinner'
import { call } from '@shared/rpc'
import type { CheckResult, GlobusCluster, GlobusStatus } from '@shared/types/globus'
import { TransferRow, useStopCopy } from '../parts/files/TransferRow'
import { Pane } from '../parts/globus/Pane'
import { SignInSheet } from '../parts/globus/SignInSheet'
import { Header } from '../parts/Header'
import { BackLayer, ConfirmDialog, IconBtn, useToast } from '../ui'

const POLL_MS = 10_000
const TITLE = 'text-xs font-semibold tracking-wide text-dim uppercase'

/** Copies that went through this phone; Globus copies are in Globus's own list below. */
function PhoneCopies() {
  const toast = useToast()
  const transfers = useTransfers((t) => {
    if (!t.error && !t.title.includes('this computer')) toast(`Copied ${t.title.split(':')[0]}`)
  })
  const [stopCopy, stopDialog] = useStopCopy(transfers.x)
  const items = transfers.items.filter((t) => t.how !== 'globus')
  if (!items.length) return null
  return (
    <section className="px-4 pt-3">
      <h3 className={`${TITLE} mb-1.5`}>Through this phone</h3>
      <div className="divide-y divide-line">{items.map((t) => <TransferRow key={t.id} t={t} flush onX={stopCopy} />)}</div>
      {stopDialog}
    </section>
  )
}

function Board({ status, left, right, tasks, tasksError, loadTasks, check, onSettings, onChoose, onConsent }: {
  status: GlobusStatus; left: PaneState; right: PaneState; tasks: ReturnType<typeof useTasks>['tasks']; tasksError: string
  loadTasks: () => void; check: () => void; onSettings: () => void; onChoose: (c: GlobusCluster) => void
  onConsent: () => void
}) {
  const toast = useToast()
  const [cancel, setCancel] = useState('')

  const transfer = (src: PaneState, dst: PaneState) => {
    const it = src.selected
    if (!it) return
    if (!dst.path) { toast('Open a folder on the other side first'); return }
    call('globus.transfer', { src_cluster: src.cluster, src_path: join(src.path, it.name),
      dst_cluster: dst.cluster, dst_path: join(dst.path, it.name), recursive: it.is_dir })
      .then(() => { toast(`Sent ${it.name} to Globus`); loadTasks() })
      .catch((e: Error) => { toast(`Transfer failed: ${e.message}`); check() })
  }
  const stop = (id: string) => call('globus.cancel', { task_id: id })
    .then(() => toast('Transfer cancelled')).catch((e: Error) => toast(`Cancel failed: ${e.message}`))
    .finally(loadTasks)
  const startPersonal = async (c: GlobusCluster) => {
    toast(`Starting Globus Connect on ${c.name}…`)
    try {
      await call('globus.start_personal', { cluster: c.id })
      toast(`Globus Connect is running on ${c.name}`)
    } catch (e) {
      toast(`Could not start Globus Connect: ${(e as Error).message}`)
    }
  }
  const names = Object.fromEntries(status.clusters.filter((c) => c.collection_name)
    .map((c) => [c.collection_name, shortName(c)]))
  const pane = (p: PaneState) => <Pane pane={p} clusters={status.clusters} onChoose={onChoose} onStart={startPersonal}
    onConsent={onConsent} />

  return (
    <div className="flex flex-col gap-3 px-4 pt-3 pb-6">
      <div className="flex items-center gap-2">
        <p className="flex-1 text-sm text-dim">You can close the app or your phone while files copy.</p>
        <IconBtn icon={Settings} label="Globus settings" onClick={onSettings} />
      </div>
      {pane(left)}
      <div className="flex gap-2">
        <UiButton kind={left.selected ? 'primary' : 'secondary'} disabled={!left.selected} className="flex-1"
          onClick={() => transfer(left, right)}>Transfer<ArrowDown size={16} /></UiButton>
        <UiButton kind={right.selected ? 'primary' : 'secondary'} disabled={!right.selected} className="flex-1"
          onClick={() => transfer(right, left)}><ArrowUp size={16} />Transfer</UiButton>
      </div>
      {pane(right)}
      <div className="flex items-center gap-2 pt-1">
        <h3 className={`${TITLE} flex-1`}>Recent transfers</h3>
        <IconBtn small icon={RefreshCw} label="Refresh" onClick={loadTasks} />
      </div>
      <div className="[&_.truncate]:whitespace-normal"><List>
        {tasksError ? <p className="p-4 text-center text-sm text-bad">{tasksError}</p>
          : !tasks?.length ? <p className="p-4 text-center text-dim">{tasks ? 'No transfers yet' : 'Loading…'}</p>
          : tasks.map((t) => <TaskRow key={t.task_id} t={t} onCancel={setCancel} names={names} />)}
      </List></div>
      {cancel && <ConfirmDialog danger keep="Keep copying" confirm="Stop copy" title="Stop this transfer?"
        text="What's copied so far stays where it is." onClose={() => setCancel('')} onConfirm={() => stop(cancel)} />}
    </div>
  )
}

export function Transfers({ tabs }: { tabs?: ReactNode }) {
  const toast = useToast()
  const [status, setStatus] = useState<GlobusStatus | null>(null)
  const [error, setError] = useState('')
  const [login, setLogin] = useState<'globus.login_url' | 'globus.consent_url' | null>(null)
  const [picking, setPicking] = useState<GlobusCluster | null>(null)
  const [settings, setSettings] = useState(false)

  const refresh = useCallback(() => call<GlobusStatus>('globus.status').then(setStatus).catch(() => {}), [])
  const left = usePane(refresh)
  const right = usePane(refresh)
  const panes = useRef<PaneState[]>([])
  panes.current = [left, right]
  const { tasks, error: tasksError, load: loadTasks } = useTasks(panes)
  const signedIn = !!status?.signed_in

  useEffect(() => {
    call<GlobusStatus>('globus.status').then(setStatus).catch((e: Error) => setError(e.message))
  }, [])

  // Find missing collections and ask each what it wants, so one sign-in can cover all of them
  const check = useCallback(() => {
    call<CheckResult>('globus.check').then((r) => {
      setStatus(r)
      r.changes.forEach((c) => toast(c.collection ? `${c.name} uses Globus collection ${c.collection}`
        : `No Globus collection found for ${c.name}. Pick one`))
      if (r.changes.length) panes.current.forEach((p) => p.reload())
    }).catch((e: Error) => toast(`Globus: ${e.message}`))
  }, [toast])

  // Signed in: open the two panes (clusters with a collection first), check, and watch transfers
  const firstClusters = useRef(false)
  useEffect(() => {
    if (!signedIn || !status) return
    if (!firstClusters.current) {
      firstClusters.current = true
      const order = [...status.clusters.filter((c) => c.collection_id), ...status.clusters]
      const first = order[0]?.id ?? ''
      panes.current[0].pick(first)
      panes.current[1].pick(order.find((c) => c.id !== first)?.id ?? first)
    } else panes.current.forEach((p) => p.reload())
    check()
    loadTasks()
    const t = setInterval(loadTasks, POLL_MS)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn])

  const signedInNow = (s: GlobusStatus) => {
    const consent = login === 'globus.consent_url'
    setLogin(null)
    setStatus(s)
    toast(consent ? 'Globus is ready' : 'Signed in to Globus')
    if (consent) {  // a fresh sign-in starts everything through signedIn
      check()  // anything left (a second domain) shows again
      panes.current.forEach((p) => p.reload())
    }
  }

  let body
  if (error) body = <EmptyState icon={CircleAlert} title="Could not load Globus" text={error} report />
  else if (!status) body = <div className="grid h-40 place-items-center"><Spinner size={24} /></div>
  else if (!status.client_id) body = <SetUp onSaved={setStatus} />
  else if (!status.signed_in) body = <SignIn onSignIn={() => setLogin('globus.login_url')} />
  else body = <Board status={status} left={left} right={right} tasks={tasks} tasksError={tasksError}
    loadTasks={loadTasks} check={check} onSettings={() => setSettings(true)} onChoose={setPicking}
    onConsent={() => setLogin('globus.consent_url')} />

  return (
    <div className="flex h-full flex-col">
      <Header title="Files" />
      {tabs}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <PhoneCopies />
        {body}
      </div>
      {settings && status && <BackLayer onBack={() => setSettings(false)}>
        <SettingsDialog status={status} onClose={() => setSettings(false)} onChange={setStatus}
          onSignIn={() => { setSettings(false); setLogin('globus.login_url') }}
          onChoose={(c) => { setSettings(false); setPicking(c) }} /></BackLayer>}
      {login && <SignInSheet start={login} onClose={() => setLogin(null)} onDone={signedInNow} />}
      {picking && <BackLayer onBack={() => setPicking(null)}>
        <CollectionPicker cluster={picking} onClose={() => setPicking(null)}
          onPicked={(s) => {
            setStatus(s)
            setPicking(null)
            panes.current.filter((p) => p.cluster === picking.id).forEach((p) => p.reload())
            check()  // the new one may want its own Allow
          }} /></BackLayer>}
    </div>
  )
}
