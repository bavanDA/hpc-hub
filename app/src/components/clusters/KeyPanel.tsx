// Login with an SSH key you paste on the cluster's key page (Yale), as three steps with only the current one open:
// your key (made here if you have none), add it on the key page, test the login (methods/keys.py). Used by the
// first-start login step and the cluster's settings. Its words are in loginCopy.ts.
import { AlertCircle, Check, CheckCircle2, Clock, Copy, ExternalLink, Info, KeyRound, Smartphone } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'

import { call } from '../../rpc'
import type { Cluster, KeyTest, MyKey } from '../../types/clusters'
import { copyText } from '../app/clipboard'
import { openSystem } from '../app/openLink'
import { Button, Spinner } from '../ui'
import { copy, keyHelp } from './loginCopy'

const KEY = 0, ADD = 1, TEST = 2

/** "What's an SSH key?": the cluster's own guide in the browser. */
export function KeyHelpLink({ cluster }: { cluster: Cluster }) {
  return (
    <button type="button" onClick={() => openSystem(keyHelp(cluster))} title={keyHelp(cluster)}
      className="inline-flex items-center gap-1 font-bold text-accent-text hover:underline">
      {copy.whatsAKey}<ExternalLink size={13} /></button>
  )
}

/** onTested: the login test's verdict, so the page can make its own button the main one once the key works. */
export function KeyPanel({ cluster: c, user, onUser, onTested }:
  { cluster: Cluster; user: string; onUser: (u: string) => void; onTested?: (ok: boolean) => void }) {
  const [key, setKey] = useState<MyKey | null | undefined>(undefined)
  const [added, setAdded] = useState(false)
  const [open, setOpen] = useState<number | null>(null)  // a done step you opened again
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

  const reached = !key ? KEY : !added ? ADD : TEST
  const at = open ?? reached
  const run = async (what: () => Promise<void>) => {
    setError('')
    try { await what() } catch (e) { setError((e as Error).message) }
  }
  const make = () => run(async () => {
    setBusy(true)
    try { setKey(await call<MyKey>('keys.create')) } finally { setBusy(false) }
  })
  const toClipboard = () => run(async () => {
    await copyText(key!.public)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  })
  const check = () => run(async () => {
    setBusy(true)
    setTest(null)
    try {
      const got = await call<KeyTest>('keys.test', { cluster: c.id, username: user })
      setTest(got)
      onTested?.(got.ok)
    } finally { setBusy(false) }
  })
  const state = (n: number) => (n === at ? 'open' : n < reached ? 'done' : 'later')

  return (
    <div className="rounded-xl bg-card px-5 py-2 shadow-[var(--shadow-card)]">
      <Step n={1} state={state(KEY)} title={copy.stepKey} done={key ? copy.haveKey(key.file) : ''}>
        {key === undefined ? <Spinner /> : <>
          <p className="text-dim">{copy.noKey}</p>
          <div><Button kind="suggested" type="button" onClick={make} disabled={busy}>
            {busy ? <Spinner /> : <KeyRound size={16} />}{copy.createKey}</Button></div>
        </>}
      </Step>
      <Step n={2} state={state(ADD)} title={copy.stepAdd(c)} done={copy.added(c)} onOpen={() => setOpen(ADD)}>
        {key && <>
          <div className="flex items-center gap-2 rounded-lg border border-line bg-pill py-1 pl-3 pr-1">
            <code className="min-w-0 flex-1 truncate font-mono text-[12px] text-dim" title={key.public}>
              {key.public}</code>
            <Button type="button" kind="flat" onClick={toClipboard} className="shrink-0 text-[13px]">
              {copied ? <><Check size={15} className="text-ok" />{copy.copied}</> : <><Copy size={15} />{copy.copyKey}</>}
            </Button>
          </div>
          <p>{copy.pasteIt(c)}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Button kind="suggested" type="button" onClick={() => openSystem(c.key_page!)}>
              {copy.openPage(c)}<ExternalLink size={15} /></Button>
            <Button kind="flat" type="button" onClick={() => { setAdded(true); setOpen(null) }}>{copy.addedIt}</Button>
          </div>
          {c.key_page_note && <p className="flex gap-2 text-[13px] text-dim">
            <Info size={14} className="mt-[3px] shrink-0" />{c.key_page_note}</p>}
        </>}
      </Step>
      <Step n={3} state={state(TEST)} title={copy.stepTest} done="" last>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="key-user" className="text-[13px] font-bold">{c.username_label || 'Username'}</label>
          <div className="flex gap-2">
            <input id="key-user" value={user} placeholder={copy.usernameHint} spellCheck={false}
              autoComplete="username" autoFocus
              onChange={(e) => { onUser(e.target.value); setTest(null); onTested?.(false) }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (user.trim()) check() } }}
              className="h-9 min-w-0 flex-1 rounded-md border border-line bg-pill px-3 outline-none
                placeholder:text-dim focus:border-accent focus:ring-2 focus:ring-accent/30" />
            <Button kind="suggested" type="button" onClick={check} disabled={!user.trim() || busy}>
              {busy && <Spinner />}{copy.testButton}</Button>
          </div>
        </div>
        {c.second_factor !== 'code' && <p className="flex gap-2 text-[13px] text-dim">
          <Smartphone size={14} className="mt-[3px] shrink-0" />{copy.keyDuo}</p>}
        {test && <Result test={test} />}
      </Step>
      {error && <p className="pb-2 text-[13px] text-bad">{error}</p>}
    </div>
  )
}

function Step({ n, state, title, done, onOpen, last, children }: {
  n: number; state: 'done' | 'open' | 'later'; title: string; done: string; onOpen?: () => void; last?: boolean
  children: ReactNode
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
          {state === 'done' && onOpen && <button type="button" onClick={onOpen}
            className="text-[13px] font-bold text-accent-text hover:underline">{copy.change}</button>}
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

function Result({ test }: { test: KeyTest }) {
  const [look, Icon] = TONE[test.kind ?? (test.ok ? 'ok' : 'error')]
  return (
    <div role="status" className={`flex gap-2.5 rounded-lg px-3 py-2.5 text-[14px] ${look}`}>
      <Icon size={17} className="mt-[2px] shrink-0" /><span>{test.text}</span>
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
