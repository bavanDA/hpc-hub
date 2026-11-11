// Agents › Permissions: what Claude may do on the cluster picked in the header without asking, and its passcode
// lock. The desktop's page, with unsaved changes asked about before you go (also by Android's Back).
import { CircleAlert, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { useActiveCluster } from '@shared/components/clusters/active'
import { shortName } from '@shared/components/clusters/loginCopy'
import { NotConnected } from '@shared/components/clusters/NotConnected'
import { ActivityDialog } from '@shared/components/permissions/ActivityDialog'
import { askLabel } from '@shared/components/permissions/asks'
import { CommandsDialog } from '@shared/components/permissions/CommandsDialog'
import { draftOf, type Draft } from '@shared/components/permissions/draft'
import { GROUPS } from '@shared/components/permissions/groups'
import { lockOk } from '@shared/components/permissions/lock'
import { LockSetupDialog } from '@shared/components/permissions/LockSetupDialog'
import { Spinner } from '@shared/components/ui/Spinner'
import { useEvent } from '@shared/hooks'
import { setLeaveGuard } from '@shared/nav'
import { call } from '@shared/rpc'
import type { Session } from '@shared/types'
import type { ClaudePermissions, CommandGroup } from '@shared/types/permissions'
import { useBackLayer, usePhoneNav } from '../../nav'
import { BackLayer, Button, ConfirmDialog, EmptyState, IconBtn, PageBar, Row, Section, ToggleRow, useToast } from '../../ui'
import { LockSection } from './LockSection'

const count = (on: number, all: number) => all ? `${on} of ${all} allowed` : 'None yet'
const OWN = 'Your own'
type Open = { kind: 'commands'; group: CommandGroup } | { kind: 'activity' | 'setup' | 'off' }

export function Permissions() {
  const toast = useToast()
  const { open: openPage } = usePhoneNav()
  const { cluster: active, session, connected } = useActiveCluster()
  const cluster = active?.id ?? ''
  const [perm, setPerm] = useState<ClaudePermissions | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [open, setOpen] = useState<Open | null>(null)
  const [leaving, setLeaving] = useState<(() => void) | null>(null)  // a move held until you answer
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
  useEffect(() => {
    if (!dirty) return
    setLeaveGuard((proceed) => { setLeaving(() => proceed); return true })
    return () => setLeaveGuard(null)
  }, [dirty])
  // Android's Back with changes not saved: ask first. Windows opened here sit above this, so it waits for them.
  useBackLayer(() => setLeaving(() => () => openPage('clusters')), dirty && !leaving && !open)
  const allowed = useMemo(() => new Set(draft?.allowed), [draft])
  const edit = (part: Partial<Draft>) => setDraft((d) => d && { ...d, ...part })
  const tick = (cmds: string[], on: boolean) => {
    const next = new Set(allowed)
    cmds.forEach((c) => (on ? next.add(c) : next.delete(c)))
    edit({ allowed: [...next].sort() })
  }
  const numbersOk = !draft || !perm?.lock.set_up || lockOk(draft.lock)

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
  const lockDone = (message: string) => { setOpen(null); toast(message); load() }
  const lockAction = (method: string, message: string) => call(method, { cluster })
    .then(() => lockDone(message)).catch((e: Error) => lockDone(`Could not do it: ${e.message}`))

  const custom = draft?.custom ?? []
  const known = (c: string) => perm?.groups.some((g) => g.commands.includes(c)) || custom.includes(c)
  const group = open?.kind === 'commands' ? open.group : null

  let body
  if (!active) body = <div className="grid h-64 place-items-center"><Spinner size={24} /></div>
  else if (!connected || error.startsWith('Connect to')) body = <div className="h-[60vh]"><NotConnected
    cluster={active} session={session} what="agent permissions" /></div>
  else if (error) body = <EmptyState icon={CircleAlert} title="Could not read Claude's settings" text={error} report />
  else if (!perm || !draft) body = <div className="grid h-64 place-items-center"><Spinner size={24} /></div>
  else body = (
    <>
      <Section title="Claude">
        <ToggleRow label="Edit files without asking" checked={draft.accept_edits}
          onChange={(v) => edit({ accept_edits: v })} />
        <ToggleRow label="Move deleted files to the trash" sub="Kept for 7 days" checked={draft.trash}
          onChange={(v) => edit({ trash: v })} />
      </Section>
      <Section title="Ask first">
        {perm.asks.map((a) => (
          <ToggleRow key={a.key} label={askLabel(a.key, a.label)} checked={draft.ask.includes(a.key)}
            onChange={(v) => edit({ ask: v ? [...draft.ask, a.key].sort() : draft.ask.filter((k) => k !== a.key) })} />
        ))}
      </Section>
      <Section title="Run without asking" note="Anything not allowed here asks you first.">
        {perm.groups.map((g) => (
          <Row key={g.title} label={GROUPS[g.title] ?? g.title} opens onPress={() => setOpen({ kind: 'commands', group: g })}
            sub={count(g.commands.filter((c) => allowed.has(c)).length, g.commands.length)} />
        ))}
        <Row label={OWN} opens onPress={() => setOpen({ kind: 'commands', group: { title: OWN, note: '', commands: custom } })}
          sub={count(custom.filter((c) => allowed.has(c)).length, custom.length)} />
      </Section>
      <LockSection status={perm.lock} config={draft.lock} onConfig={(lock) => edit({ lock })}
        onSetUp={() => setOpen({ kind: 'setup' })} onOff={() => setOpen({ kind: 'off' })}
        onActivity={() => setOpen({ kind: 'activity' })}
        onUnlock={() => lockAction('permissions.lock_reset', 'Unlocked')} />
      <p className="px-5 pt-5 text-sm text-dim">ChatGPT and Antigravity ask before running commands.</p>
    </>
  )

  return (
    <>
      <PageBar>
        <span className="flex-1" />
        {connected && <>
          {loading && <Spinner />}
          <IconBtn icon={RefreshCw} label="Reload from the cluster" onClick={load} />
          <Button kind="primary" disabled={!dirty || saving || !numbersOk} onClick={save}>
            {saving && <Spinner size={14} />}Save</Button>
        </>}
      </PageBar>
      <div className="min-h-0 flex-1 overflow-y-auto pb-6">{body}</div>
      {group && draft && (
        <BackLayer onBack={() => setOpen(null)}>
          <CommandsDialog group={group} own={group.title === OWN} allowed={allowed} known={known}
            commands={group.title === OWN ? custom : group.commands} onChange={tick}
            onAdd={(cmd) => edit({ custom: [...draft.custom, cmd], allowed: [...draft.allowed, cmd].sort() })}
            onClose={() => setOpen(null)} />
        </BackLayer>
      )}
      {open?.kind === 'activity' && perm && (
        <BackLayer onBack={() => setOpen(null)}>
          <ActivityDialog status={perm.lock} onClose={() => setOpen(null)} />
        </BackLayer>
      )}
      {open?.kind === 'setup' && (
        <BackLayer onBack={() => setOpen(null)}>
          <LockSetupDialog cluster={cluster} name={name} onClose={() => setOpen(null)} onDone={lockDone} />
        </BackLayer>
      )}
      {open?.kind === 'off' && (
        <ConfirmDialog title={`Turn off the passcode lock on ${name}?`} keep="Keep the lock" confirm="Turn off" danger
          text="Claude takes messages without a code again." onClose={() => setOpen(null)}
          onConfirm={() => lockAction('permissions.lock_off', 'Passcode lock is off')} />
      )}
      {leaving && (
        <ConfirmDialog title="Throw away your changes?" keep="Keep editing" confirm="Throw away" danger
          onClose={() => setLeaving(null)} onConfirm={() => { setLeaveGuard(null); leaving() }} />
      )}
    </>
  )
}
