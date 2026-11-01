// After the first start's cluster picker: for each cluster you chose, its sign-in, then its compute node.
// A sign-in can wait ("Do this later": asked on the first Connect); all of it changes later in the cluster's Settings.
import { Cpu, ExternalLink, Globe, KeyRound, Lock } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'

import { call } from '../../rpc'
import { secondStep, summary, type Cluster, type Logins, type Profile } from '../../types/clusters'
import { Duration } from '../clusters/ComputeDialog'
import { EntryRow, SpinRow, SwitchRow, Toggle } from '../clusters/fields'
import { KeyPanel, keyHeading, PasswordInstead } from '../clusters/KeyPanel'
import { KeySetupDialog } from '../clusters/KeySetupDialog'
import { copy, shortName } from '../clusters/loginCopy'
import { minutes, slurmTime } from '../clusters/time'
import { Button, List, Spinner } from '../ui'
import { openSystem } from './openLink'
import { keyStore } from './platform'

type Step = { cluster: Cluster; kind: 'login' | 'node' }

export function Onboarding({ ids, onDone }: { ids: string[]; onDone: () => void }) {
  const [steps, setSteps] = useState<Step[] | null>(null)
  const [at, setAt] = useState(0)
  const done = useRef(onDone)
  useEffect(() => {
    call<Cluster[]>('clusters.list').then((all) => {
      const found = ids.flatMap((id) => {
        const c = all.find((x) => x.id === id)
        return c ? [{ cluster: c, kind: 'login' as const }, { cluster: c, kind: 'node' as const }] : []
      })
      if (found.length) setSteps(found)
      else done.current()
    }).catch(() => done.current())
  }, [ids])

  const step = steps?.[at]
  if (!steps || !step) return <div className="grid h-full place-items-center"><Spinner size={24} /></div>
  const next = () => (at + 1 < steps.length ? setAt(at + 1) : onDone())
  const last = at + 1 === steps.length
  return (
    <div className="flex h-full flex-col items-center overflow-auto px-8 py-10">
      <div className="flex w-full max-w-[560px] flex-col gap-6">
        <Progress steps={steps} at={at} />
        {step.kind === 'login'
          ? <LoginStep key={at} cluster={step.cluster} onNext={next} />
          : <NodeStep key={at} cluster={step.cluster} onNext={next} last={last} />}
      </div>
    </div>
  )
}

function Progress({ steps, at }: { steps: Step[]; at: number }) {
  const clusters = steps.filter((s) => s.kind === 'login')
  const which = clusters.findIndex((s) => s.cluster.id === steps[at].cluster.id) + 1
  return (
    <div className="flex items-center gap-3 text-sm text-dim">
      <span>{steps[at].cluster.name}{clusters.length > 1 ? ` · cluster ${which} of ${clusters.length}` : ''}</span>
      <div className="flex flex-1 gap-1.5" aria-label={`Step ${at + 1} of ${steps.length}`}>
        {steps.map((_, i) => (
          <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= at ? 'bg-accent' : 'bg-selected'}`} />
        ))}
      </div>
    </div>
  )
}

function Heading({ icon, title, text }: { icon: ReactNode; title: string; text?: ReactNode }) {
  return (
    <div className={`flex gap-4 ${text ? 'items-start' : 'items-center'}`}>
      <div className="grid size-12 shrink-0 place-items-center rounded-full bg-pill text-accent-text">{icon}</div>
      <div className={`min-w-0 ${text ? 'pt-1' : ''}`}>
        <h1 className="text-2xl font-bold">{title}</h1>
        {text && <p className="mt-1 text-dim">{text}</p>}
      </div>
    </div>
  )
}

/** onSkip: a quiet "Do this later" link on the left (asked again on the first Connect). */
function Footer({ onSkip, children }: { onSkip?: () => void; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      {onSkip ? <button type="button" onClick={onSkip}
        className="rounded px-1 py-1 text-base text-dim underline-offset-2 hover:text-text hover:underline">
        {copy.skip}</button> : <span />}
      {children}
    </div>
  )
}

/** The lock line under a password, or what turning Remember off means. */
function RememberNote({ remember }: { remember: boolean }) {
  return (
    <p className="flex items-center gap-1.5 px-1 text-sm text-dim">
      {remember ? <><Lock size={14} className="shrink-0" />{copy.savedIn(keyStore)}</> : copy.rememberOff}</p>
  )
}

function LoginStep({ cluster: c, onNext }: { cluster: Cluster; onNext: () => void }) {
  const [user, setUser] = useState('')
  const [password, setPassword] = useState('')
  const [saved, setSaved] = useState(false)
  const [remember, setRemember] = useState(true)
  const [portal, setPortal] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [usePassword, setUsePassword] = useState(false)  // a key cluster that takes a password too
  const [works, setWorks] = useState(false)  // the key's login test passed: Continue is the main button
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    call<Logins>('clusters.login', { cluster: c.id }).then((l) => {
      setUser(l.ssh.username)
      setSaved(l.ssh.password)
      setRemember(l.remember ?? true)
    }).catch(() => {}).finally(() => setLoaded(true))
  }, [c.id])

  async function save() {
    setBusy(true)
    setError('')
    try {
      await call('clusters.set_login', { cluster: c.id, kind: 'ssh', username: user, password, remember })
      onNext()
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  const instead = c.key_page && c.password_too
    ? <PasswordInstead on={usePassword} onChange={setUsePassword} /> : null
  if (c.key_page && !usePassword) {
    const head = keyHeading(c)
    // Skip keeps a username you typed: the key is on disk either way
    const skip = () => (user.trim() ? save() : onNext())
    return (
      <form className="flex flex-col gap-6" onSubmit={(e) => { e.preventDefault(); if (works) save() }}>
        <Heading icon={<KeyRound size={20} />} title={head.title} text={head.text} />
        {loaded ? <KeyPanel cluster={c} user={user} onUser={setUser} onTested={setWorks} />
          : <div className="grid h-40 place-items-center"><Spinner size={24} /></div>}
        {instead}
        {error && <p className="text-bad">{error}</p>}
        <Footer onSkip={works ? undefined : skip}>
          <Button kind="primary" pill type="submit" disabled={!works || busy}>{copy.continue}</Button>
        </Footer>
      </form>
    )
  }
  const label = c.username_label || 'Username'
  return (
    <form className="flex flex-col gap-6" onSubmit={(e) => { e.preventDefault(); if (user.trim()) save() }}>
      <Heading icon={<KeyRound size={20} />} title={copy.signIn(c)}
        text={c.second_factor === 'code' ? <>{secondStep(c)}{c.code_setup && <> <button type="button"
          onClick={() => openSystem(c.code_setup!)} className="inline-flex items-center gap-1 font-semibold
          text-accent-text hover:underline">{copy.codeSetup}<ExternalLink size={14} /></button></>}</> : undefined} />
      {c.portal && (
        <div className="flex flex-col gap-3">
          <Button kind="primary" pill type="button" onClick={() => setPortal(true)}>
            <Globe size={16} /> {copy.portal(c)}</Button>
          <p className="text-sm text-dim">{copy.orPassword}</p>
        </div>
      )}
      <div className="flex flex-col gap-3">
        <List>
          <EntryRow label={label} value={user} onChange={setUser} autoFocus={!c.portal} placeholder={copy.usernameHint} />
          <EntryRow label={copy.password} value={password} onChange={setPassword} password
            placeholder={saved ? copy.saved : undefined} />
          <SwitchRow label={copy.remember} checked={remember} onChange={setRemember} />
        </List>
        <RememberNote remember={remember} />
      </div>
      {instead}
      {error && <p className="text-bad">{error}</p>}
      <Footer onSkip={onNext}>
        <Button kind={c.portal ? 'secondary' : 'primary'} pill type="submit" disabled={!user.trim() || busy}>
          {copy.continue}</Button>
      </Footer>
      {portal && <KeySetupDialog cluster={c} onClose={() => setPortal(false)}
        onDone={() => { setPortal(false); onNext() }} />}
    </form>
  )
}

function NodeStep({ cluster: c, onNext, last }: { cluster: Cluster; onNext: () => void; last: boolean }) {
  const [want, setWant] = useState(c.request_node_on_connect ?? true)
  const [ask, setAsk] = useState(c.ask_node ?? false)
  const [p, setP] = useState<Profile>(c.profile)
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState('')
  const set = (change: Partial<Profile>) => setP((x) => ({ ...x, ...change }))

  async function save() {
    try {
      await call('clusters.update', { cluster: c.id, changes: { request_node_on_connect: want, ask_node: ask,
        profile: { cpus: p.cpus, mem_gb: p.mem_gb, time: p.time, partition: p.partition } } })
      onNext()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <form className="flex flex-col gap-6" onSubmit={(e) => { e.preventDefault(); save() }}>
      <Heading icon={<Cpu size={20} />} title="Compute node"
        text="Your terminals and agents run on a compute node, not the busy login node." />
      <div className="overflow-hidden rounded-xl bg-card shadow-[var(--shadow-card)]">
        <label className="flex cursor-pointer items-center gap-4 px-5 py-4">
          <span className="min-w-0 flex-1">
            <span className="block text-md font-semibold">Get a compute node when I connect</span>
            <span className="block text-sm text-dim">
              {want ? 'HPC Hub asks Slurm for one right after you sign in.' : 'You can still get one from the cluster card.'}
            </span>
          </span>
          <Toggle checked={want} onChange={setWant} label="Get a compute node when I connect" />
        </label>
        {want && (
          <div className="border-t border-line px-5 py-4">
            {!editing ? (
              <div className="flex items-center gap-4">
                <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-pill text-accent-text">
                  <Cpu size={20} /></div>
                <div className="min-w-0 flex-1">
                  <div className="text-md font-semibold">{summary(p)}</div>
                  <div className="text-sm text-dim">The usual size for {shortName(c)}</div>
                </div>
                <Button type="button" kind="pill" onClick={() => setEditing(true)}>Change</Button>
              </div>
            ) : (
              <div className="-mx-5 -my-4">
                <List>
                  <SpinRow label="CPU cores" value={p.cpus} onChange={(cpus) => set({ cpus })} min={1} max={512} />
                  <SpinRow label="Memory (GB)" value={p.mem_gb} onChange={(mem_gb) => set({ mem_gb })} min={1} max={4096} />
                  <Duration total={minutes(p.time) ?? 240} onChange={(m) => set({ time: slurmTime(m) })} limits={null} />
                  {c.profile.partition && <EntryRow label="Partition" value={p.partition}
                    onChange={(partition) => set({ partition })} />}
                </List>
              </div>
            )}
            <label className="mt-4 flex cursor-pointer items-center gap-2.5 text-base">
              <input type="checkbox" checked={ask} onChange={(e) => setAsk(e.target.checked)}
                className="size-4 accent-[var(--color-accent)]" />
              Review these before each request
            </label>
          </div>
        )}
      </div>
      <p className="-mt-3 px-1 text-sm text-dim">You can change this later in Settings.</p>
      {error && <p className="text-bad">{error}</p>}
      <Footer>
        <Button kind="primary" pill type="submit">{last ? 'Done' : copy.continue}</Button>
      </Footer>
    </form>
  )
}
