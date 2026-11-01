// After the first start's cluster picker: for each cluster you chose, its login, then its compute node.
// Each step can be skipped, and all of it changed later in the cluster's Settings.
import { Cpu, Globe, KeyRound, Lock } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'

import { call } from '../../rpc'
import { secondStep, type Cluster, type Logins, type Profile } from '../../types/clusters'
import { Duration } from '../clusters/ComputeDialog'
import { CheckRow, EntryRow, Group, SpinRow, SwitchRow } from '../clusters/fields'
import { KeyHelpLink, KeyPanel, PasswordInstead } from '../clusters/KeyPanel'
import { KeySetupDialog } from '../clusters/KeySetupDialog'
import { copy } from '../clusters/loginCopy'
import { minutes, slurmTime } from '../clusters/time'
import { Button, List, Spinner } from '../ui'
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
  if (!steps || !step) return <div className="grid h-full place-items-center"><Spinner size={28} /></div>
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
  return (
    <div className="flex items-center gap-3 text-[13px] text-dim">
      <span>{steps[at].cluster.name}</span>
      <div className="flex flex-1 gap-1.5" aria-label={`Step ${at + 1} of ${steps.length}`}>
        {steps.map((_, i) => (
          <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= at ? 'bg-accent' : 'bg-selected'}`} />
        ))}
      </div>
      <span>{at + 1} of {steps.length}</span>
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

function Footer({ onSkip, skip, children }: { onSkip: () => void; skip: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Button kind="flat" type="button" onClick={onSkip}>{skip}</Button>
      {children}
    </div>
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

  const site = c.portal ? new URL(c.portal).hostname : ''
  const instead = c.key_page && c.password_too
    ? <PasswordInstead on={usePassword} onChange={setUsePassword} /> : null
  if (c.key_page && !usePassword) {
    return (
      <form className="flex flex-col gap-6" onSubmit={(e) => { e.preventDefault(); if (user.trim()) save() }}>
        <Heading icon={<KeyRound size={22} />} title={copy.signIn(c)}
          text={<>{copy.keyIntro} <KeyHelpLink cluster={c} /></>} />
        {loaded ? <KeyPanel cluster={c} user={user} onUser={setUser} onTested={setWorks} />
          : <div className="grid h-40 place-items-center"><Spinner size={24} /></div>}
        {instead}
        {error && <p className="text-bad">{error}</p>}
        <Footer onSkip={onNext} skip="Skip for now">
          <Button kind={works ? 'suggested' : 'pill'} round type="submit" disabled={!user.trim() || busy}>
            Continue</Button>
        </Footer>
      </form>
    )
  }
  const label = c.username_label || 'Username'
  return (
    <form className="flex flex-col gap-6" onSubmit={(e) => { e.preventDefault(); if (user.trim()) save() }}>
      <Heading icon={<KeyRound size={22} />} title={copy.signIn(c)}
        text={c.password_only ? undefined : secondStep(c)} />
      {site && (
        <div className="flex flex-col gap-2">
          <Button kind="suggested" round type="button" onClick={() => setPortal(true)}>
            <Globe size={16} /> Log in through {site}</Button>
          <p className="text-center text-[13px] text-dim">No password needed. Or type your login below.</p>
        </div>
      )}
      <div className="flex flex-col gap-3">
        <List>
          <EntryRow label={label} value={user} onChange={setUser} autoFocus={!site} placeholder={copy.usernameHint} />
          <EntryRow label={saved ? 'Password (saved, leave empty to keep)' : 'Password'} value={password}
            onChange={setPassword} password placeholder={c.password_only ? copy.passwordHelp(c) : undefined} />
        </List>
        {c.password_only
          ? <div className="flex gap-3 rounded-xl bg-pill px-4 py-3 text-[13px]">
              <Lock size={16} className="mt-0.5 shrink-0 text-accent-text" />
              <div className="flex flex-col gap-1">
                <p>{copy.passwordNote(keyStore)}</p>
                {c.second_factor !== 'code' && <p className="text-dim">{copy.passwordDuo}</p>}
              </div>
            </div>
          : <p className="flex items-center gap-1.5 px-1 text-[13px] text-dim">
              <Lock size={13} className="shrink-0" />{copy.savedIn(keyStore)}</p>}
        <label className="flex cursor-pointer items-center gap-2 self-start px-1 text-[14px]">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)}
            className="size-4 accent-[var(--color-accent)]" />
          {copy.remember}
        </label>
      </div>
      {instead}
      {error && <p className="text-bad">{error}</p>}
      <Footer onSkip={onNext} skip="Skip for now">
        <Button kind={site ? 'pill' : 'suggested'} round type="submit" disabled={!user.trim() || busy}>
          Continue</Button>
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
    <form className="flex flex-col gap-5" onSubmit={(e) => { e.preventDefault(); save() }}>
      <Heading icon={<Cpu size={22} />} title={`Compute node on ${c.name}`}
        text="HPC Hub can ask Slurm for a node when you connect, so your terminals and agents run there." />
      <div>
        <Group>
          <SwitchRow label="Get a node when I connect" checked={want} onChange={setWant} />
          {want && <>
            <SpinRow label="CPU cores" value={p.cpus} onChange={(cpus) => set({ cpus })} min={1} max={512} />
            <SpinRow label="Memory (GB)" value={p.mem_gb} onChange={(mem_gb) => set({ mem_gb })} min={1} max={4096} />
            <Duration total={minutes(p.time) ?? 240} onChange={(m) => set({ time: slurmTime(m) })} limits={null} />
            {c.profile.partition && <EntryRow label="Partition" value={p.partition}
              onChange={(partition) => set({ partition })} />}
            <CheckRow label="Ask every time" sub="Show these before each request, so you can change them"
              checked={ask} onChange={setAsk} />
          </>}
        </Group>
        <p className="-mt-3 px-1 text-[13px] text-dim">You can change this later in Settings.</p>
      </div>
      {error && <p className="text-bad">{error}</p>}
      <Footer onSkip={onNext} skip="Skip">
        <Button kind="suggested" round type="submit">{last ? 'Done' : 'Continue'}</Button>
      </Footer>
    </form>
  )
}
