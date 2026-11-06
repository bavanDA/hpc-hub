// Agents › Permissions › a cluster: what Claude may do there without asking, and its passcode lock. The same calls
// as the desktop's Permissions page, laid out as rows: switches, typed numbers, and a screen per command group.
import { CircleAlert, ShieldCheck, WifiOff } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { shortName } from '@shared/components/clusters/loginCopy'
import { askLabel } from '@shared/components/permissions/asks'
import { lockConfig } from '@shared/components/permissions/lock'
import { Spinner } from '@shared/components/ui'
import { call } from '@shared/rpc'
import type { Cluster } from '@shared/types/clusters'
import type { ClaudePermissions, CommandGroup, LockConfig, LockSetup, LockStatus } from '@shared/types/permissions'
import { Button, ConfirmSheet, EmptyState, Field, List, MainButton, NumberRow, Row, Section, Sheet, ToggleRow,
  inRange, useAskBeforeClose, useToast } from '../../ui'

type Draft = { allowed: string[]; custom: string[]; trash: boolean; ask: string[]; accept_edits: boolean
  lock: LockConfig }

const draftOf = (p: ClaudePermissions): Draft => ({ allowed: [...p.allowed].sort(), custom: p.custom,
  trash: p.trash, ask: [...p.ask].sort(), accept_edits: p.accept_edits, lock: lockConfig(p.lock) })

const GROUPS: Record<string, string> = { Slurm: 'Jobs and modules' }
const count = (on: number, all: number) => all ? `${on} of ${all} allowed` : 'None yet'

export function PermissionsSheet({ cluster, onClose }: { cluster: Cluster; onClose: () => void }) {
  const toast = useToast()
  const short = shortName(cluster)
  const [perm, setPerm] = useState<ClaudePermissions | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [open, setOpen] = useState<'setup' | 'off' | 'activity' | CommandGroup | null>(null)

  const show = (p: ClaudePermissions) => { setPerm(p); setDraft(draftOf(p)); setError('') }
  const load = useCallback(() => {
    call<ClaudePermissions>('permissions.get', { cluster: cluster.id })
      .then(show).catch((e: Error) => { setPerm(null); setDraft(null); setError(e.message) })
  }, [cluster.id])
  useEffect(load, [load])

  const dirty = useMemo(() => !!perm && !!draft && JSON.stringify(draftOf(perm)) !== JSON.stringify(draft),
    [perm, draft])
  const allowed = useMemo(() => new Set(draft?.allowed), [draft])
  const edit = (part: Partial<Draft>) => setDraft((d) => d && { ...d, ...part })
  const tick = (cmds: string[], on: boolean) => {
    const next = new Set(allowed)
    cmds.forEach((c) => (on ? next.add(c) : next.delete(c)))
    edit({ allowed: [...next].sort() })
  }
  const [close, ask] = useAskBeforeClose(dirty, onClose)
  const lockOk = !draft || !perm?.lock.set_up
    || (inRange(draft.lock.minutes, 0, 240) && inRange(draft.lock.tries, 1, 10))

  const save = () => {
    if (!draft || !perm) return
    setSaving(true)
    call<ClaudePermissions>('permissions.save', { cluster: cluster.id, allowed: draft.allowed, trash: draft.trash,
      ask: draft.ask, accept_edits: draft.accept_edits, lock_config: perm.lock.set_up ? draft.lock : null })
      .then((p) => { show(p); toast(`Saved. Claude sessions on ${short} use it after a restart`) })
      .catch((e: Error) => toast(`Could not save: ${e.message}`))
      .finally(() => setSaving(false))
  }
  const lockDone = (message: string) => { setOpen(null); toast(message); load() }
  const lockAction = (method: string, message: string) => call(method, { cluster: cluster.id })
    .then(() => lockDone(message)).catch((e: Error) => lockDone(`That didn't work: ${e.message}`))

  let body
  if (error.startsWith('Connect to')) body = <div className="h-[60vh]"><EmptyState icon={WifiOff}
    title={`Connect to ${short} first`} text="Its permissions show once it's connected." /></div>
  else if (error) body = <div className="h-[60vh]"><EmptyState icon={CircleAlert}
    title="Couldn't read Claude's settings" text={error} /></div>
  else if (!perm || !draft) body = <div className="grid h-64 place-items-center"><Spinner size={24} /></div>
  else body = (
    <div className="pb-4">
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
          <Row key={g.title} label={GROUPS[g.title] ?? g.title} opens onPress={() => setOpen(g)}
            sub={count(g.commands.filter((c) => allowed.has(c)).length, g.commands.length)} />
        ))}
        <Row label="Your own" opens onPress={() => setOpen({ title: 'Your own', note: '', commands: draft.custom })}
          sub={count(draft.custom.filter((c) => allowed.has(c)).length, draft.custom.length)} />
      </Section>
      <LockSection status={perm.lock} config={draft.lock} onConfig={(lock) => edit({ lock })}
        onSetUp={() => setOpen('setup')} onOff={() => setOpen('off')} onActivity={() => setOpen('activity')}
        onUnlock={() => lockAction('permissions.lock_reset', 'Unlocked')} />
      <p className="px-4 pt-5 text-sm text-dim">ChatGPT and Antigravity ask before running commands.</p>
    </div>
  )

  const group = open && typeof open === 'object' ? open : null
  return (
    <>
      <Sheet flush title={`Permissions on ${short}`} onClose={close}
        actions={draft && <MainButton disabled={!dirty || saving || !lockOk} onClick={save}>
          {saving && <Spinner size={16} />}Save</MainButton>}>
        {body}
      </Sheet>
      {group && draft && (
        <CommandsSheet group={group} custom={group.title === 'Your own'} commands={group.title === 'Your own'
          ? draft.custom : group.commands} allowed={allowed} onChange={tick} onClose={() => setOpen(null)}
          known={(c) => perm!.groups.some((g) => g.commands.includes(c)) || draft.custom.includes(c)}
          onAdd={(c) => edit({ custom: [...draft.custom, c], allowed: [...draft.allowed, c].sort() })} />
      )}
      {open === 'setup' && <LockSetupSheet cluster={cluster.id} short={short} onClose={() => setOpen(null)}
        onDone={lockDone} />}
      {open === 'activity' && perm && <ActivitySheet status={perm.lock} onClose={() => setOpen(null)} />}
      {open === 'off' && (
        <ConfirmSheet title="Turn off the passcode lock?" text="Claude takes messages without a code again."
          keep="Keep the lock" confirm="Turn off" danger onClose={() => setOpen(null)}
          onConfirm={() => lockAction('permissions.lock_off', 'Passcode lock is off')} />
      )}
      {ask}
    </>
  )
}

function LockSection({ status, config, onConfig, onSetUp, onOff, onActivity, onUnlock }: {
  status: LockStatus; config: LockConfig; onConfig: (c: LockConfig) => void; onSetUp: () => void; onOff: () => void
  onActivity: () => void; onUnlock: () => void
}) {
  const note = 'Claude takes no messages until you start one with the code from your authenticator app.'
  if (!status.set_up) return (
    <Section title="Passcode lock" note={note}>
      <Row icon={ShieldCheck} label="Set up with Google Authenticator" opens onPress={onSetUp} />
    </Section>
  )
  const set = (part: Partial<LockConfig>) => onConfig({ ...config, ...part })
  // "Every message" is its own choice: clearing the minutes while typing (-1) must not turn it on.
  const [every, setEvery] = useState(config.minutes === 0)
  useEffect(() => { if (config.minutes >= 0) setEvery(config.minutes === 0) }, [config.minutes])
  return (
    <Section title="Passcode lock" note={note}>
      {status.locked && (
        <Row label={<span className="font-semibold text-bad">Locked after wrong codes</span>}
          sub="Check Recent activity"><Button onClick={onUnlock}>Unlock</Button></Row>
      )}
      <ToggleRow label="Ask for the code on every message" checked={every}
        onChange={(v) => { setEvery(v); set({ minutes: v ? 0 : 10 }) }} />
      {!every && <NumberRow label="A code lasts" unit="min" min={1} max={240} value={config.minutes}
        onChange={(minutes) => set({ minutes: minutes > 0 ? minutes : -1 })} />}
      <NumberRow label="Wrong codes allowed" unit={config.tries === 1 ? 'code' : 'codes'} min={1} max={10}
        value={config.tries} onChange={(tries) => set({ tries })} />
      <ToggleRow label="Then sign Claude out" checked={config.logout} onChange={(logout) => set({ logout })} />
      <ToggleRow label="Then cancel Claude's job" checked={config.scancel} onChange={(scancel) => set({ scancel })} />
      <Row label="Recent activity" opens onPress={onActivity}
        sub={`${status.open} session${status.open === 1 ? '' : 's'} open now`} />
      <Row label="Turn off passcode lock" danger onPress={onOff} />
    </Section>
  )
}

/** One group of commands: allow all, or one by one. "Your own" also takes new ones. */
function CommandsSheet({ group, custom, commands, allowed, known, onChange, onAdd, onClose }: {
  group: CommandGroup; custom: boolean; commands: string[]; allowed: Set<string>; known: (cmd: string) => boolean
  onChange: (cmds: string[], on: boolean) => void; onAdd: (cmd: string) => void; onClose: () => void
}) {
  const toast = useToast()
  const [text, setText] = useState('')
  const add = () => {
    const cmd = text.trim().split(/\s+/)[0]
    setText('')
    if (!cmd) return
    if (cmd === 'rm') { toast("rm can't be allowed. Deleted files go to the trash instead"); return }
    if (known(cmd)) onChange([cmd], true)
    else onAdd(cmd)
  }
  const on = commands.filter((c) => allowed.has(c)).length
  return (
    <Sheet flush title={GROUPS[group.title] ?? group.title} onClose={onClose}
      actions={<MainButton onClick={onClose}>Done</MainButton>}>
      {custom && (
        <div className="flex items-end gap-2 px-4 pb-2">
          <div className="min-w-0 flex-1"><Field label="Add a command" value={text} placeholder="conda or ./run.sh"
            autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="done"
            onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} /></div>
          <Button className="mb-2" disabled={!text.trim()} onClick={add}>Add</Button>
        </div>
      )}
      {commands.length > 0 && (
        <Section note={group.note || undefined}>
          <ToggleRow label="Allow all of them" checked={on === commands.length}
            onChange={(v) => onChange(commands, v)} />
        </Section>
      )}
      {commands.length > 0 ? (
        <List className="mt-5">
          {commands.map((c) => (
            <ToggleRow key={c} label={c} checked={allowed.has(c)} onChange={(v) => onChange([c], v)} />
          ))}
        </List>
      ) : <p className="px-4 pt-4 text-dim">None yet.</p>}
    </Sheet>
  )
}

function ActivitySheet({ status, onClose }: { status: LockStatus; onClose: () => void }) {
  return (
    <Sheet flush title="Recent activity" onClose={onClose}>
      {status.log.length
        ? <List>{status.log.map((l, i) => <Row key={i} label={<span className="text-sm">{l}</span>} />)}</List>
        : <p className="px-4 pt-4 text-dim">Nothing yet.</p>}
    </Sheet>
  )
}

/** Scan the QR code, type the code it shows. The secret stays in the backend until it is on the cluster. */
function LockSetupSheet({ cluster, short, onClose, onDone }:
  { cluster: string; short: string; onClose: () => void; onDone: (message: string) => void }) {
  const [setup, setSetup] = useState<LockSetup | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const id = useRef('')

  useEffect(() => {
    let live = true
    const drop = (sid: string) => call('permissions.lock_cancel', { id: sid }).catch(() => {})
    call<LockSetup>('permissions.lock_start', { cluster }).then((s) => {
      if (!live) { drop(s.id); return }
      id.current = s.id
      setSetup(s)
    }).catch((e: Error) => setError(e.message))
    return () => {
      live = false
      if (id.current) drop(id.current)  // closed without turning it on: forget the secret
    }
  }, [cluster])

  const turnOn = () => {
    if (!setup || busy || !code.trim()) return
    setBusy(true)
    setError('')
    call('permissions.lock_finish', { id: setup.id, code })
      .then(() => { id.current = ''; onDone(`Passcode lock is on for ${short}. New Claude sessions need a code`) })
      .catch((e: Error) => { setError(e.message); setBusy(false) })
  }

  return (
    <Sheet title="Passcode lock" onClose={onClose}
      actions={setup && <MainButton disabled={busy || !code.trim()} onClick={turnOn}>
        {busy && <Spinner size={16} />}Turn on</MainButton>}>
      {!setup ? (
        <div className="grid h-48 place-items-center">{error ? <p className="text-bad">{error}</p> : <Spinner />}</div>
      ) : (
        <div className="flex flex-col items-center gap-4 text-center">
          <p>Scan this with Google Authenticator or another authenticator app.</p>
          {setup.qr && <img src={setup.qr} alt="QR code"
            className="size-52 rounded-lg border border-line bg-white p-1 [image-rendering:pixelated]" />}
          <div className="text-sm text-dim">Or type this key in the app:
            <div className="mt-1 font-mono text-base tracking-wide text-text select-text">{setup.key}</div></div>
          <div className="w-full text-left">
            <Field label="Code from the app" inputMode="numeric" maxLength={7} value={code}
              onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && turnOn()} />
          </div>
          {error && <p className="text-sm text-bad">{error}</p>}
        </div>
      )}
    </Sheet>
  )
}
