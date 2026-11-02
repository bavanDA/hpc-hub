// Permissions: per cluster, what Claude may run without asking, and its passcode lock.
import { CircleAlert, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { useActiveCluster } from '../components/clusters/active'
import { shortName } from '../components/clusters/loginCopy'
import { NotConnected } from '../components/clusters/NotConnected'
import { Commands } from '../components/permissions/Commands'
import { Group, SwitchRow } from '../components/permissions/controls'
import { LockGroup, LockSetupDialog, lockConfig } from '../components/permissions/Lock'
import { useToast } from '../components/toast'
import { AlertDialog, Button, EmptyState, IconButton, Spinner } from '../components/ui'
import { useEvent } from '../hooks'
import { call } from '../rpc'
import type { Session } from '../types'
import type { ClaudePermissions, LockConfig } from '../types/permissions'

type Draft = { allowed: string[]; custom: string[]; trash: boolean; ask: string[]; accept_edits: boolean
  lock: LockConfig }

const draftOf = (p: ClaudePermissions): Draft => ({ allowed: [...p.allowed].sort(), custom: p.custom,
  trash: p.trash, ask: [...p.ask].sort(), accept_edits: p.accept_edits, lock: lockConfig(p.lock) })

export function Permissions() {
  const toast = useToast()
  const { cluster: active, session, connected } = useActiveCluster()
  const cluster = active?.id ?? ''
  const [perm, setPerm] = useState<ClaudePermissions | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [lockDialog, setLockDialog] = useState<'setup' | 'off' | null>(null)
  useEffect(() => { setPerm(null); setDraft(null); setError('') }, [cluster])  // another cluster picked

  const show = (p: ClaudePermissions) => { setPerm(p); setDraft(draftOf(p)); setError('') }
  const load = useCallback(() => {
    if (!cluster || !connected) return
    setLoading(true)
    call<ClaudePermissions>('permissions.get', { cluster })
      .then(show).catch((e: Error) => { setPerm(null); setDraft(null); setError(e.message) })
      .finally(() => setLoading(false))
  }, [cluster, connected])
  useEffect(load, [load])
  useEvent<Session>('session', (s) => { if (s.id === cluster && s.state === 'Connected' && !perm) load() })

  const dirty = useMemo(() => !!perm && !!draft && JSON.stringify(draftOf(perm)) !== JSON.stringify(draft),
    [perm, draft])
  const name = active ? shortName(active) : cluster
  const allowed = useMemo(() => new Set(draft?.allowed), [draft])
  const edit = (part: Partial<Draft>) => setDraft((d) => d && { ...d, ...part })
  const tick = (cmds: string[], on: boolean) => {
    const next = new Set(allowed)
    cmds.forEach((c) => (on ? next.add(c) : next.delete(c)))
    edit({ allowed: [...next].sort() })
  }

  const save = () => {
    if (!draft || !perm) return
    setSaving(true)
    call<ClaudePermissions>('permissions.save', { cluster, allowed: draft.allowed, trash: draft.trash, ask: draft.ask,
      accept_edits: draft.accept_edits, lock_config: perm.lock.set_up ? draft.lock : null })
      .then((p) => { show(p); toast(`Saved on ${name}. Running Claude sessions pick it up when restarted`) })
      .catch((e: Error) => toast(`Could not save: ${e.message}`))
      .finally(() => setSaving(false))
  }
  // The lock edits settings.json too: read it again before anything saves over it
  const lockDone = (message: string) => { setLockDialog(null); toast(message); load() }
  const lockAction = (method: string, message: string) => call(method, { cluster })
    .then(() => lockDone(message)).catch((e: Error) => lockDone(`Could not do it: ${e.message}`))

  let body
  if (!active) body = <div className="grid h-64 place-items-center"><Spinner size={24} /></div>
  else if (!connected || error.startsWith('Connect to')) body = <div className="h-[60vh]"><NotConnected
    cluster={active} session={session} what="agent permissions" /></div>
  else if (error) body = <div className="h-[60vh]"><EmptyState icon={CircleAlert}
    title="Could not read Claude's settings" text={error} /></div>
  else if (!perm || !draft) body = <div className="grid h-64 place-items-center"><Spinner size={24} /></div>
  else body = (
    <div className="flex flex-col gap-6">
      <Group title="Claude" description="What Claude may do on the cluster without asking you.">
        <SwitchRow title="Edit files without asking" on={draft.accept_edits}
          onChange={(v) => edit({ accept_edits: v })} />
        <SwitchRow title="Move deleted files to the trash" subtitle="Kept for 7 days"
          on={draft.trash} onChange={(v) => edit({ trash: v })} />
      </Group>
      <Group title="Always ask first" description="Even when allowed below">
        {perm.asks.map((a) => (
          <div key={a.key} title={a.hint}>
            <SwitchRow title={a.label} on={draft.ask.includes(a.key)}
              onChange={(v) => edit({ ask: v ? [...draft.ask, a.key].sort() : draft.ask.filter((k) => k !== a.key) })} />
          </div>
        ))}
      </Group>
      <LockGroup status={perm.lock} config={draft.lock} onConfig={(lock) => edit({ lock })}
        onSetUp={() => setLockDialog('setup')} onOff={() => setLockDialog('off')}
        onUnlock={() => lockAction('permissions.lock_reset', 'Unlocked')} />
      <Commands groups={perm.groups} custom={draft.custom} allowed={allowed} onChange={tick}
        onAdd={(cmd) => edit({ custom: [...draft.custom, cmd], allowed: [...draft.allowed, cmd].sort() })} />
      <p className="px-1 text-sm text-dim">ChatGPT and Antigravity ask before running commands.</p>
    </div>
  )

  return (
    <div className="mx-auto flex max-w-[760px] flex-col gap-5 px-4 py-6">
      {connected && <div className="flex items-center gap-2">
        <span className="flex-1" />
        {loading && <Spinner />}
        <IconButton icon={RefreshCw} label="Reload from the cluster" size={16} onClick={load} />
        <Button kind="suggested" disabled={!dirty || saving} onClick={save}>
          {saving && <Spinner size={14} />}Save</Button>
      </div>}
      {body}
      {lockDialog === 'setup' && <LockSetupDialog cluster={cluster} name={name} onClose={() => setLockDialog(null)}
        onDone={lockDone} />}
      {lockDialog === 'off' && (
        <AlertDialog title={`Turn off the passcode lock on ${name}?`} keep="Keep the lock" act="Turn off"
          onClose={() => setLockDialog(null)} onAct={() => lockAction('permissions.lock_off', 'Passcode lock is off')}>
          <p>Claude will take messages without a code again.</p>
        </AlertDialog>
      )}
    </div>
  )
}
