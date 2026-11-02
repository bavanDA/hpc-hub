// After the first start's cluster picker: for each cluster you chose, its sign-in, then its compute node. Style E:
// a title, rows, one main button. A sign-in can wait ("Do this later": asked on the first Connect); all of it changes
// later in the cluster's Settings.
import { ExternalLink, Globe } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'

import { call } from '../../rpc'
import { secondStep, type Cluster, type Logins, type Profile } from '../../types/clusters'
import { ASK } from '../clusters/ComputeDialog'
import { KeyPanel, keyHeading, PasswordInstead } from '../clusters/KeyPanel'
import { KeySetupDialog } from '../clusters/KeySetupDialog'
import { copy, shortName } from '../clusters/loginCopy'
import { NodeFields } from '../e/NodeFields'
import { Button } from '../e/parts'
import { Field, List, MainButton, Section, ToggleRow } from '../e/ui'
import { Spinner } from '../ui'
import { openSystem } from './openLink'

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
    <div className="flex h-full flex-col items-center overflow-auto py-10">
      <div className="flex w-full max-w-[600px] flex-col gap-6">
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
    <div className="flex items-center gap-3 px-5 text-sm text-dim">
      {clusters.length > 1 && <span>Cluster {which} of {clusters.length}</span>}
      <div className="flex flex-1 gap-1.5" aria-label={`Step ${at + 1} of ${steps.length}`}>
        {steps.map((_, i) => (
          <span key={i} className={`h-1 flex-1 rounded-full ${i <= at ? 'bg-accent' : 'bg-line-strong'}`} />
        ))}
      </div>
    </div>
  )
}

function Heading({ title, text }: { title: string; text?: ReactNode }) {
  return (
    <div className="px-5">
      <h1 className="text-2xl font-semibold">{title}</h1>
      {text && <p className="mt-1.5 text-dim">{text}</p>}
    </div>
  )
}

/** The main button, then a quiet "Do this later" under it (asked again on the first Connect). */
function Footer({ onSkip, children }: { onSkip?: () => void; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1 px-5 pt-2">
      {children}
      {onSkip && <Button kind="quiet" className="text-dim" onClick={onSkip}>{copy.skip}</Button>}
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

  const instead = c.key_page && c.password_too
    ? <div className="flex px-5"><PasswordInstead on={usePassword} onChange={setUsePassword} /></div> : null
  const failed = error && <p role="alert" className="px-5 font-semibold text-bad">{error}</p>
  if (c.key_page && !usePassword) {
    const head = keyHeading(c)
    // Skip keeps a username you typed: the key is on disk either way
    const skip = () => (user.trim() ? save() : onNext())
    return (
      <form className="flex flex-col gap-5" onSubmit={(e) => { e.preventDefault(); if (works) save() }}>
        <Heading title={head.title} text={head.text} />
        <div className="px-5">
          {loaded ? <KeyPanel cluster={c} user={user} onUser={setUser} onTested={setWorks} />
            : <div className="grid h-40 place-items-center"><Spinner size={24} /></div>}
        </div>
        {instead}
        {failed}
        <Footer onSkip={works || user.trim() ? undefined : skip}>
          <MainButton type="submit" disabled={!works || busy}>{copy.continue}</MainButton>
        </Footer>
      </form>
    )
  }
  const label = c.username_label || 'Username'
  return (
    <form className="flex flex-col gap-5" onSubmit={(e) => { e.preventDefault(); if (user.trim()) save() }}>
      <Heading title={copy.signIn(c)}
        text={c.second_factor === 'code' ? <>{secondStep(c)}{c.code_setup && <> <button type="button"
          onClick={() => openSystem(c.code_setup!)} className="inline-flex items-center gap-1 font-semibold text-text
          underline-offset-2 hover:underline">{copy.codeSetup}<ExternalLink size={14} /></button></>}</> : undefined} />
      {c.portal && (
        <div className="flex flex-col gap-2 px-5">
          <MainButton type="button" icon={Globe} onClick={() => setPortal(true)}>{copy.portal(c)}</MainButton>
          <p className="text-center text-sm text-dim">{copy.portalNote}</p>
          <p className="pt-3 text-dim">{copy.orPassword}</p>
        </div>
      )}
      <div>
        <div className="px-5">
          <Field label={label} value={user} autoFocus={!c.portal} placeholder={copy.usernameHint}
            onChange={(e) => setUser(e.target.value)} />
          <Field label={copy.password} type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder={saved ? copy.saved : undefined} />
        </div>
        <Section note={remember ? copy.savedIn : undefined}>
          <ToggleRow label={copy.remember} sub={remember ? undefined : copy.rememberOff} checked={remember}
            onChange={setRemember} />
        </Section>
      </div>
      {instead}
      {failed}
      <Footer onSkip={user.trim() || saved ? undefined : onNext}>
        {c.portal
          ? <Button type="submit" className="h-11 w-full" disabled={!user.trim() || busy}>{copy.continue}</Button>
          : <MainButton type="submit" disabled={!user.trim() || busy}>{copy.continue}</MainButton>}
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
  const [ok, setOk] = useState(true)
  const [error, setError] = useState('')

  async function save() {
    try {
      await call('clusters.update', { cluster: c.id, changes: { request_node_on_connect: want, ask_node: ask,
        profile: { cpus: p.cpus, mem_gb: p.mem_gb, gpus: p.gpus ?? 0, gpu_type: p.gpu_type ?? '', time: p.time,
          partition: p.partition, account: p.account ?? '', qos: p.qos ?? '' } } })
      onNext()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <form className="flex flex-col gap-5" onSubmit={(e) => { e.preventDefault(); save() }}>
      <Heading title={`Compute node on ${shortName(c)}`}
        text="Your terminals and agents run on a compute node, not the busy login node." />
      <div>
        <List>
          <ToggleRow label="Get a compute node when I connect" checked={want} onChange={setWant}
            sub={want ? 'Ready as soon as you sign in.' : 'You can still get one from the cluster card.'} />
        </List>
        {want && <div className="pt-5">
          <NodeFields cluster={c.id} value={p} onChange={setP} onValid={setOk} extra={false} /></div>}
        {want ? <Section note="You can change this later in Settings.">
          <ToggleRow label={ASK} sub="Shows the node window when you connect." checked={ask} onChange={setAsk} />
        </Section> : <p className="px-5 pt-2 text-sm text-dim">You can change this later in Settings.</p>}
      </div>
      {error && <p role="alert" className="px-5 font-semibold text-bad">{error}</p>}
      <Footer>
        <MainButton type="submit" disabled={want && !ok}>{last ? 'Done' : copy.continue}</MainButton>
      </Footer>
    </form>
  )
}
