// Login with an SSH key you paste on the cluster's key page (Yale): make the key, copy it, paste it there, then
// test it with your username (methods/keys.py). Used by the first-start login step and the cluster's settings.
// Its words are in loginCopy.ts.
import { Check, ChevronRight, KeyRound, Laptop, Lock, Server } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'

import { call } from '../../rpc'
import type { Cluster, MyKey } from '../../types/clusters'
import { copyText } from '../app/clipboard'
import { openSystem } from '../app/openLink'
import { Button, List, Spinner } from '../ui'
import { copy } from './loginCopy'

type Test = { ok: boolean; text: string }

export function KeyPanel({ cluster: c, user, onUser }: { cluster: Cluster; user: string; onUser: (u: string) => void }) {
  const [key, setKey] = useState<MyKey | null | undefined>(undefined)
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [test, setTest] = useState<Test | null>(null)
  const [error, setError] = useState('')
  useEffect(() => { call<MyKey | null>('keys.mine').then(setKey).catch(() => setKey(null)) }, [])

  const run = async (what: () => Promise<void>) => {
    setError('')
    try { await what() } catch (e) { setError((e as Error).message) }
  }
  const make = () => run(async () => setKey(await call<MyKey>('keys.create')))
  const toClipboard = () => run(async () => {
    await copyText(key!.public)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  })
  const check = () => run(async () => {
    setBusy(true)
    setTest(null)
    try { setTest(await call<Test>('keys.test', { cluster: c.id, username: user })) } finally { setBusy(false) }
  })

  return (
    <div className="flex flex-col gap-3">
      <Explainer cluster={c} />
      <List>
        <Step n={1} done={!!key} title={copy.stepMake} sub={key ? copy.haveKey(key.kind, key.made_on) : undefined}>
          {key === undefined ? <Spinner /> : !key && <Button kind="suggested" type="button" onClick={make}>
            {copy.makeButton}</Button>}
        </Step>
        <Step n={2} done={copied} title={copy.stepCopy} sub={key ? <code className="block truncate font-mono text-[12px]">
          {key.public}</code> : undefined}>
          <Button type="button" disabled={!key} onClick={toClipboard}>{copied ? copy.copied : copy.copyButton}</Button>
        </Step>
        <Step n={3} title={copy.stepPaste(c)} sub={c.key_page_note}>
          <Button type="button" onClick={() => openSystem(c.key_page!)}>{copy.openPage}</Button>
        </Step>
        <Step n={4} done={!!test?.ok} title={copy.stepUser}
          sub={test && <span className={test.ok ? 'text-ok' : 'text-bad'}>{test.text}</span>}>
          <input value={user} onChange={(e) => { onUser(e.target.value); setTest(null) }} placeholder="jdoe"
            aria-label={copy.stepUser} spellCheck={false} autoComplete="username"
            className="h-9 w-36 rounded-md bg-pill px-2 outline-none focus:ring-2 focus:ring-accent" />
          <Button type="button" disabled={!key || !user.trim() || busy} onClick={check}>
            {busy ? <Spinner /> : copy.testButton}</Button>
        </Step>
      </List>
      {error && <p className="text-bad">{error}</p>}
    </div>
  )
}

function Step({ n, title, sub, done, children }:
  { n: number; title: string; sub?: ReactNode; done?: boolean; children: ReactNode }) {
  return (
    <div className="flex min-h-[60px] items-center gap-3 px-4 py-2">
      <span className={`grid size-7 shrink-0 place-items-center rounded-full text-[13px] font-bold ${
        done ? 'bg-ok-bg text-ok' : 'bg-pill text-dim'}`}>{done ? <Check size={15} /> : n}</span>
      <div className="min-w-0 flex-1">
        <div>{title}</div>
        {sub && <div className="text-[13px] text-dim">{sub}</div>}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  )
}

function Explainer({ cluster }: { cluster: Cluster }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="text-[13px]">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}
        className="flex items-center gap-1 font-bold text-accent-text hover:underline">
        <ChevronRight size={14} className={`transition ${open ? 'rotate-90' : ''}`} /> {copy.whatsAKey}</button>
      {open && (
        <div className="mt-2 flex items-center gap-4 rounded-xl bg-pill p-3">
          <div className="flex shrink-0 items-center gap-1.5 text-accent-text" aria-hidden>
            <Laptop size={22} /><KeyRound size={16} />
            <span className="mx-1 h-px w-6 bg-line" />
            <Lock size={16} /><Server size={22} />
          </div>
          <p className="text-dim">{copy.keyExplained(cluster)}</p>
        </div>
      )}
    </div>
  )
}

/** Below the key panel of a cluster that also takes a password (password_too). */
export function PasswordInstead({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!on)}
      className="self-start text-[13px] font-bold text-accent-text hover:underline">
      {on ? copy.useKey : copy.usePassword}</button>
  )
}
