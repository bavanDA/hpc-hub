// Sign-in with an SSH key you paste on the cluster's key page (Yale), as three steps with only the current one
// open: make a key (or use yours), give it to the cluster, try it (methods/keys.py). Used by the first-start
// sign-in step and the cluster's settings. The words come from signInVariants.ts (B unless ?variant=a|c).
import { AlertCircle, Check, CheckCircle2, Clock, Copy, ExternalLink, Info, KeyRound } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'

import { call } from '../../rpc'
import type { Cluster, KeyTest, MyKey } from '../../types/clusters'
import { copyText } from '../app/clipboard'
import { openSystem } from '../app/openLink'
import { Button, Spinner } from '../ui'
import { KeyChecklist } from './KeyChecklist'
import { copy, keyHelp, who } from './loginCopy'
import { A, B, C, variant } from './signInVariants'

const KEY = 0, ADD = 1, TEST = 2

/** The screen's title and the line under it, for the page around the panel. */
export function keyHeading(c: Cluster): { title: string; text: ReactNode } {
  const v = variant()
  if (v === 'c') return { title: C.title(c.name), text: null }
  if (v === 'a') return { title: copy.signIn(c), text: null }
  return { title: copy.signIn(c), text: <>{B.intro(who(c))} <KeyHelpLink cluster={c} /></> }
}

/** "What's an SSH key?": the cluster's own guide in the browser. */
export function KeyHelpLink({ cluster, label }: { cluster: Cluster; label?: string }) {
  return (
    <button type="button" onClick={() => openSystem(keyHelp(cluster))} title={keyHelp(cluster)}
      className="inline-flex items-center gap-1 font-bold text-accent-text hover:underline">
      {label ?? copy.whatsAKey}<ExternalLink size={13} /></button>
  )
}

export type PanelProps = { cluster: Cluster; user: string; onUser: (u: string) => void; onTested?: (ok: boolean) => void }

/** The key's state and what you can do with it, shared by the stepper and the checklist. */
export function useKeySignIn({ cluster: c, user, onTested }: PanelProps) {
  const [key, setKey] = useState<MyKey | null | undefined>(undefined)
  const [made, setMade] = useState(false)
  const [added, setAdded] = useState(false)
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [test, setTest] = useState<KeyTest | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    call<MyKey | null>('keys.mine').then((k) => {
      setKey(k)
      if (k && user.trim()) setAdded(true)  // a key and a username from before: set up already, start at the test
    }).catch(() => setKey(null))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (what: () => Promise<void>) => {
    setError('')
    try { await what() } catch (e) { setError((e as Error).message) }
  }
  return {
    key, made, added, copied, busy, test, error,
    setAdded, clearTest: () => { setTest(null); onTested?.(false) },
    make: () => run(async () => {
      setBusy(true)
      try { setKey(await call<MyKey>('keys.create')); setMade(true) } finally { setBusy(false) }
    }),
    copyKey: () => run(async () => {
      await copyText(key!.public)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }),
    openPage: () => openSystem(c.key_page!),
    check: () => run(async () => {
      setBusy(true)
      setTest(null)
      try {
        const got = await call<KeyTest>('keys.test', { cluster: c.id, username: user })
        setTest(got)
        onTested?.(got.ok)
      } finally { setBusy(false) }
    }),
  }
}

export function KeyPanel(props: PanelProps) {
  return variant() === 'c' ? <KeyChecklist {...props} /> : <KeyStepper {...props} />
}

function KeyStepper(props: PanelProps) {
  const { cluster: c, user, onUser } = props
  const w = variant() === 'a' ? A : B
  const s = useKeySignIn(props)
  const [open, setOpen] = useState<number | null>(null)  // a done step you opened again
  const works = !!s.test?.ok
  const reached = !s.key ? KEY : !s.added ? ADD : works ? TEST + 1 : TEST
  const at = open ?? reached
  const state = (n: number) => (n === at ? 'open' : n < reached ? 'done' : 'later')
  const org = who(c)
  const file = s.key?.file ?? ''

  return (
    <div className="rounded-xl bg-card px-5 py-2 shadow-[var(--shadow-card)]">
      <Step n={1} state={state(KEY)} title={state(KEY) === 'done' ? w.stepKeyDone : w.stepKey}
        done={s.made ? w.made(file) : w.found(file)}>
        {s.key === undefined ? <Spinner /> : (
          <div className="flex flex-wrap items-center gap-3">
            <Button kind="suggested" type="button" onClick={s.make} disabled={s.busy}>
              {s.busy ? <Spinner /> : <KeyRound size={16} />}{w.create}</Button>
            {w === A && <KeyHelpLink cluster={c} label={A.help} />}
          </div>
        )}
      </Step>
      <Step n={2} state={state(ADD)} title={w.stepAdd(org)} done={w.pastedDone} change={w.change}
        onOpen={() => setOpen(ADD)}>
        {s.key && <>
          <div className="flex items-center gap-2 rounded-lg border border-line bg-pill py-1 pl-3 pr-1">
            <code className="min-w-0 flex-1 truncate font-mono text-[12px] text-dim" title={s.key.public}>
              {s.key.public}</code>
            <Button type="button" kind="flat" onClick={s.copyKey} className="shrink-0 text-[13px]">
              {s.copied ? <><Check size={15} className="text-ok" />{w.copied}</> : <><Copy size={15} />{w.copy}</>}
            </Button>
          </div>
          {w.pasteIt(org) && <p>{w.pasteIt(org)}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <Button kind="suggested" type="button" onClick={s.openPage}>{w.open}<ExternalLink size={15} /></Button>
            <Button kind="flat" type="button" onClick={() => { s.setAdded(true); setOpen(null) }}>{w.pasted}</Button>
          </div>
          {w.pageNote(c.key_page_note ?? '') && <p className="flex gap-2 text-[13px] text-dim">
            <Info size={14} className="mt-[3px] shrink-0" />{w.pageNote(c.key_page_note ?? '')}</p>}
        </>}
      </Step>
      <Step n={3} state={state(TEST)} title={w.stepTest} done={w.signedInAs(user.trim())} last>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="key-user" className="text-[13px] font-bold">{c.username_label || 'Username'}</label>
          <div className="flex gap-2">
            <input id="key-user" value={user} placeholder={copy.usernameHint} spellCheck={false}
              autoComplete="username" autoFocus
              onChange={(e) => { onUser(e.target.value); s.clearTest() }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (user.trim()) s.check() } }}
              className="h-9 min-w-0 flex-1 rounded-md border border-line bg-pill px-3 outline-none
                placeholder:text-dim focus:border-accent focus:ring-2 focus:ring-accent/30" />
            <Button kind="suggested" type="button" onClick={s.check} disabled={!user.trim() || s.busy}>
              {s.busy && <Spinner />}{s.test && !works ? w.tryAgain : w.tryIt}</Button>
          </div>
        </div>
        {s.busy && c.second_factor !== 'code' && <p className="text-[13px] text-dim">{w.duoNow}</p>}
        {s.test && !works && <Result test={s.test} text={w.result(s.test, org)} />}
      </Step>
      {works && <div className="pb-3"><Result test={s.test!} text={w.result(s.test!, org)} /></div>}
      {s.error && <p className="pb-2 text-[13px] text-bad">{s.error}</p>}
    </div>
  )
}

function Step({ n, state, title, done, change, onOpen, last, children }: {
  n: number; state: 'done' | 'open' | 'later'; title: string; done: string; change?: string; onOpen?: () => void
  last?: boolean; children: ReactNode
}) {
  const mark = state === 'done' ? 'bg-ok-bg text-ok' : state === 'open' ? 'bg-accent text-white'
    : 'border-2 border-line text-dim'
  return (
    <div className="flex gap-4 py-3">
      <div className="flex flex-col items-center">
        <span className={`grid size-7 shrink-0 place-items-center rounded-full text-[13px] font-bold ${mark}`}>
          {state === 'done' ? <Check size={15} strokeWidth={3} /> : n}</span>
        {!last && <span className="-mb-3 mt-1 w-px flex-1 bg-line" />}
      </div>
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex items-baseline gap-3">
          <div className={`min-w-0 flex-1 ${state === 'open' ? 'font-bold' : state === 'later' ? 'text-dim' : ''}`}>
            {title}</div>
          {state === 'done' && onOpen && change && <button type="button" onClick={onOpen}
            className="-my-1 rounded px-2 py-1 text-[14px] font-bold text-accent-text hover:bg-hover">{change}</button>}
        </div>
        {state === 'done' && done && <div className="text-[13px] text-dim">{done}</div>}
        {state === 'open' && <div className="mt-3 flex flex-col gap-3 pb-1">{children}</div>}
      </div>
    </div>
  )
}

const TONE = {
  ok: ['bg-ok-bg text-ok', CheckCircle2], wait: ['bg-warn-bg text-warn', Clock], error: ['bg-bad-bg text-bad', AlertCircle],
} as const

export function Result({ test, text }: { test: KeyTest; text: string }) {
  const [look, Icon] = TONE[test.kind ?? (test.ok ? 'ok' : 'error')]
  return (
    <div role="status" className={`flex gap-2.5 rounded-lg px-3 py-2.5 text-[14px] ${look}`}>
      <Icon size={17} className="mt-[2px] shrink-0" /><span>{text}</span>
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
