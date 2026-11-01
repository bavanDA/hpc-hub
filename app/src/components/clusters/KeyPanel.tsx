// Sign-in with an SSH key you paste on the cluster's key page (Yale), as three steps with only the current one
// open: a key (yours, or one HPC Hub makes), give it to the cluster, try it (methods/keys.py). Used by the
// first-start sign-in step and the cluster's settings. The words are in loginStrings.ts, shared with GTK.
import { AlertCircle, Check, CheckCircle2, Clock, Copy, ExternalLink, FolderOpen, Info, KeyRound } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'

import { call } from '../../rpc'
import type { Cluster, KeyTest, MyKey } from '../../types/clusters'
import { copyText } from '../app/clipboard'
import { openSystem } from '../app/openLink'
import { inTauri } from '../app/platform'
import { Button, Spinner } from '../ui'
import { copy, fill, keyHelp, who } from './loginCopy'
import { S } from './loginStrings'

const KEY = 0, ADD = 1, TEST = 2

/** The screen's title and the line under it, for the page around the panel. */
export function keyHeading(c: Cluster): { title: string; text: ReactNode } {
  return { title: copy.signIn(c), text: <>{copy.keyIntro(c)} <KeyHelpLink cluster={c} /></> }
}

/** "What's an SSH key?": the cluster's own guide in the browser. */
export function KeyHelpLink({ cluster, label }: { cluster: Cluster; label?: string }) {
  return (
    <button type="button" onClick={() => openSystem(keyHelp(cluster))} title={keyHelp(cluster)}
      className="inline-flex items-center gap-1 font-semibold text-accent-text hover:underline">
      {label ?? copy.whatsAKey}<ExternalLink size={14} /></button>
  )
}

/** A private key file from the system's file dialog, starting in ~/.ssh. */
async function pickKeyFile(): Promise<string | null> {
  if (!inTauri) return '/home/jdoe/.ssh/lab_ed25519'  // design preview
  const { open } = await import('@tauri-apps/plugin-dialog')
  const { homeDir, join } = await import('@tauri-apps/api/path')
  const start = await homeDir().then((h) => join(h, '.ssh')).catch(() => undefined)
  const got = await open({ title: S.PICK_KEY, defaultPath: start, multiple: false, directory: false })
  return typeof got === 'string' ? got : null
}

export type PanelProps = { cluster: Cluster; user: string; onUser: (u: string) => void; onTested?: (ok: boolean) => void }

/** The key's state and what you can do with it. */
function useKeySignIn({ cluster: c, user, onTested }: PanelProps) {
  const [key, setKey] = useState<MyKey | null | undefined>(undefined)
  const [how, setHow] = useState<'found' | 'made' | 'picked'>('found')
  const [added, setAdded] = useState(false)
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [test, setTest] = useState<KeyTest | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    call<MyKey | null>('keys.mine', { cluster: c.id }).then((k) => {
      setKey(k)
      if (k && user.trim()) setAdded(true)  // a key and a username from before: set up already, start at the test
    }).catch(() => setKey(null))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (what: () => Promise<void>) => {
    setError('')
    try { await what() } catch (e) { setError((e as Error).message) }
  }
  return {
    key, how, added, copied, busy, test, error,
    setAdded, clearTest: () => { setTest(null); onTested?.(false) },
    make: () => run(async () => {
      setBusy(true)
      try { setKey(await call<MyKey>('keys.create')); setHow('made') } finally { setBusy(false) }
    }),
    pick: () => run(async () => {
      const path = await pickKeyFile()
      if (!path) return
      setKey(await call<MyKey>('keys.use', { cluster: c.id, path }))
      setHow('picked')
      setTest(null)
      onTested?.(false)
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

const said = (t: KeyTest, org: string) =>
  fill((S.TEST as Record<string, string>)[t.reason ?? ''] ?? t.text, { who: org, last: t.last ?? '' }).trim()

export function KeyPanel(props: PanelProps) {
  const { cluster: c, user, onUser } = props
  const s = useKeySignIn(props)
  const [open, setOpen] = useState<number | null>(null)  // a done step you opened again
  const works = !!s.test?.ok
  const reached = !s.key ? KEY : !s.added ? ADD : works ? TEST + 1 : TEST
  const at = open ?? reached
  const state = (n: number) => (n === at ? 'open' : n < reached ? 'done' : 'later')
  const org = who(c)
  const file = s.key?.file ?? ''
  const keyLine = fill(s.how === 'made' ? S.KEY_MADE : s.how === 'picked' ? S.KEY_PICKED : S.KEY_FOUND, { file })
  const toTest = () => { s.setAdded(true); setOpen(null) }

  return (
    <div className="rounded-xl bg-card px-5 py-2 shadow-[var(--shadow-card)]">
      <Step n={1} state={state(KEY)} title={state(KEY) === 'done' ? S.STEP_KEY_DONE : S.STEP_KEY} done={keyLine}
        change={S.CHANGE} onOpen={() => setOpen(KEY)}>
        {s.key === undefined ? <Spinner /> : (
          <>
            {s.key && <p className="text-sm text-dim">{keyLine}</p>}
            <div className="flex flex-wrap items-center gap-2">
              {!s.key && <Button kind="suggested" type="button" onClick={s.make} disabled={s.busy}>
                {s.busy ? <Spinner /> : <KeyRound size={16} />}{S.CREATE_KEY}</Button>}
              <Button kind={s.key ? 'pill' : 'flat'} type="button" onClick={() => { s.pick(); setOpen(null) }}>
                <FolderOpen size={16} />{S.USE_MINE}</Button>
            </div>
          </>
        )}
      </Step>
      <Step n={2} state={state(ADD)} title={fill(S.STEP_ADD, { who: org })} done={S.PASTED} change={S.CHANGE}
        onOpen={() => setOpen(ADD)}>
        {s.key && <>
          <div className="flex items-center gap-2 rounded-lg border border-line bg-pill py-1 pl-3 pr-1">
            <code className="min-w-0 flex-1 truncate font-mono text-xs text-dim" title={s.key.public}>
              {s.key.public}</code>
            <Button type="button" kind="flat" onClick={s.copyKey} className="shrink-0 text-sm">
              {s.copied ? <><Check size={16} className="text-ok" />{S.COPIED}</> : <><Copy size={16} />{S.COPY_KEY}</>}
            </Button>
          </div>
          <p>{fill(S.PASTE_IT, { who: org })}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Button kind="suggested" type="button" onClick={s.openPage}>{S.OPEN_PAGE}<ExternalLink size={16} /></Button>
            <Button kind="flat" type="button" onClick={toTest}>{S.PASTED_IT}</Button>
          </div>
          {c.key_page_note && <p className="flex gap-2 text-sm text-dim">
            <Info size={14} className="mt-[3px] shrink-0" />{c.key_page_note}</p>}
          <button type="button" onClick={toTest}
            className="self-start text-sm text-dim underline-offset-2 hover:text-text hover:underline">
            {fill(S.ALREADY_ON, { who: org })}</button>
        </>}
      </Step>
      <Step n={3} state={state(TEST)} title={S.STEP_TEST} done={fill(S.SIGNED_IN_AS, { user: user.trim() })} last>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="key-user" className="text-sm font-semibold">{c.username_label || 'Username'}</label>
          <div className="flex gap-2">
            <input id="key-user" value={user} placeholder={copy.usernameHint} spellCheck={false}
              autoComplete="username" autoFocus
              onChange={(e) => { onUser(e.target.value); s.clearTest() }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (user.trim()) s.check() } }}
              className="h-9 min-w-0 flex-1 rounded-md border border-line bg-pill px-3 outline-none
                placeholder:text-dim focus-visible:border-focus focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus" />
            <Button kind="suggested" type="button" onClick={s.check} disabled={!user.trim() || s.busy}>
              {s.busy && <Spinner />}{s.test && !works ? S.TRY_AGAIN : S.TRY}</Button>
          </div>
        </div>
        {s.busy && c.second_factor !== 'code' && <p className="text-sm text-dim">{S.DUO_NOW}</p>}
        {s.test && !works && <Result test={s.test} text={said(s.test, org)} />}
        {s.test?.reason === 'no_vpn' && c.vpn.enabled && (
          <div><Button type="button" onClick={() => call('clusters.connect', { cluster: c.id, vpn_only: true })
            .catch(() => {})}>{copy.connectVpn(c)}</Button></div>
        )}
      </Step>
      {works && <div className="pb-3"><Result test={s.test!} text={said(s.test!, org)} /></div>}
      {s.error && <p className="pb-2 text-sm text-bad">{s.error}</p>}
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
        <span className={`grid size-7 shrink-0 place-items-center rounded-full text-sm font-semibold ${mark}`}>
          {state === 'done' ? <Check size={16} strokeWidth={3} /> : n}</span>
        {!last && <span className="-mb-3 mt-1 w-px flex-1 bg-line" />}
      </div>
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex items-baseline gap-3">
          <div className={`min-w-0 flex-1 ${state === 'open' ? 'font-semibold' : state === 'later' ? 'text-dim' : ''}`}>
            {title}</div>
          {state === 'done' && onOpen && change && <button type="button" onClick={onOpen}
            className="-my-1 rounded px-2 py-1 text-base font-semibold text-accent-text hover:bg-hover">{change}</button>}
        </div>
        {state === 'done' && done && <div className="text-sm text-dim">{done}</div>}
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
    <div role="status" className={`flex gap-2.5 rounded-lg px-3 py-2.5 text-base ${look}`}>
      <Icon size={16} className="mt-[2px] shrink-0" /><span>{text}</span>
    </div>
  )
}

/** Below the key panel of a cluster that also takes a password (password_too). */
export function PasswordInstead({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!on)}
      className="self-start text-sm font-semibold text-accent-text hover:underline">
      {on ? copy.useKey : copy.usePassword}</button>
  )
}
