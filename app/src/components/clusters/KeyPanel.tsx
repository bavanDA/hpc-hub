import { Check, Copy, ExternalLink, FolderOpen, Info, KeyRound } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'

import { call } from '../../rpc'
import type { Cluster, KeyTest, MyKey } from '../../types/clusters'
import { copyText } from '../app/clipboard'
import { openSystem } from '../app/openLink'
import { inTauri } from '../app/platform'
import { EButton } from '../e/EButton'
import { Spinner } from '../ui/Spinner'
import { Result } from './KeyTestResult'
import { copy, fill, who } from './loginCopy'
import { S } from './loginStrings'

const KEY = 0, ADD = 1, TEST = 2

/** A private key file from the system's file dialog, starting in ~/.ssh. */
async function pickKeyFile(): Promise<string | null> {
  if (!inTauri) return '/home/jdoe/.ssh/lab_ed25519'  // design preview
  const { open } = await import('@tauri-apps/plugin-dialog')
  const { homeDir, join } = await import('@tauri-apps/api/path')
  const start = await homeDir().then((h) => join(h, '.ssh')).catch(() => undefined)
  const got = await open({ title: S.PICK_KEY, defaultPath: start, multiple: false, directory: false })
  return typeof got === 'string' ? got : null
}

/** signedIn: the cluster is connected now, so the key works and the test step starts done. */
export type PanelProps = { cluster: Cluster; user: string; onUser: (u: string) => void; onTested?: (ok: boolean) => void
  signedIn?: boolean }

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
  const [known, setKnown] = useState(!!props.signedIn)  // connected with this username: no need to try it
  const works = !!s.test?.ok || (known && !s.test && !!s.key && s.added)
  const reached = !s.key ? KEY : !s.added ? ADD : works ? TEST + 1 : TEST
  const at = open ?? reached
  const state = (n: number) => (n === at ? 'open' : n < reached ? 'done' : 'later')
  const org = who(c)
  const file = s.key?.file ?? ''
  const keyLine = fill(s.how === 'made' ? S.KEY_MADE : s.how === 'picked' ? S.KEY_PICKED : S.KEY_FOUND, { file })
  const toTest = () => { s.setAdded(true); setOpen(null) }

  return (
    <div className="flex flex-col">
      <Step n={1} state={state(KEY)} title={state(KEY) === 'done' ? S.STEP_KEY_DONE : S.STEP_KEY} done={keyLine}
        change={S.CHANGE} onOpen={() => setOpen(KEY)}>
        {s.key === undefined ? <Spinner /> : (
          <>
            {s.key && <p className="text-sm text-dim">{keyLine}</p>}
            <div className="flex flex-wrap items-center gap-2">
              {!s.key && <EButton icon={s.busy ? undefined : KeyRound} onClick={s.make}
                disabled={s.busy}>{s.busy && <Spinner />}{S.CREATE_KEY}</EButton>}
              <EButton icon={FolderOpen} onClick={() => { s.pick(); setOpen(null) }}>{S.USE_MINE}</EButton>
            </div>
          </>
        )}
      </Step>
      <Step n={2} state={state(ADD)} title={fill(S.STEP_ADD, { who: org })} done={S.PASTED} change={S.CHANGE}
        onOpen={() => setOpen(ADD)}>
        {s.key && <>
          <div className="flex h-10 items-center gap-2 rounded-lg border border-line-strong pr-1 pl-3">
            <code className="min-w-0 flex-1 truncate font-mono text-xs text-dim" title={s.key.public}>
              {s.key.public}</code>
            <EButton kind="quiet" icon={s.copied ? Check : Copy} onClick={s.copyKey} className="h-8 px-2.5 text-sm">
              {s.copied ? S.COPIED : S.COPY_KEY}</EButton>
          </div>
          <p>{fill(S.PASTE_IT, { who: org })}</p>
          <div className="flex flex-wrap items-center gap-2">
            <EButton onClick={s.openPage}>{S.OPEN_PAGE}<ExternalLink size={16} /></EButton>
            <EButton onClick={toTest}>{S.PASTED_IT}</EButton>
          </div>
          {c.key_page_note && <p className="flex gap-2 text-sm text-dim">
            <Info size={14} className="mt-[3px] shrink-0" />{c.key_page_note}</p>}
        </>}
      </Step>
      <Step n={3} state={state(TEST)} title={S.STEP_TEST} done={fill(S.SIGNED_IN_AS, { user: user.trim() })}
        change={S.CHANGE} onOpen={() => setOpen(TEST)} last>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="key-user" className="text-sm text-dim">{c.username_label || 'Username'}</label>
          <div className="flex gap-2">
            <input id="key-user" value={user} placeholder={copy.usernameHint} spellCheck={false}
              autoComplete="username" autoFocus
              onChange={(e) => { onUser(e.target.value); setKnown(false); s.clearTest() }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (user.trim()) s.check() } }}
              className="h-10 min-w-0 flex-1 rounded-lg border border-line-strong bg-window px-3 outline-none
                placeholder:text-faint focus:border-accent focus:ring-1 focus:ring-accent" />
            <EButton onClick={s.check} disabled={!user.trim() || s.busy}>
              {s.busy && <Spinner />}{s.test && !works ? S.TRY_AGAIN : S.TRY}</EButton>
          </div>
        </div>
        {s.busy && c.second_factor !== 'code' && <p className="text-sm text-dim">{S.DUO_NOW}</p>}
        {s.test && !works && <Result test={s.test} text={said(s.test, org)} />}
        {s.test?.reason === 'no_vpn' && c.vpn.enabled && (
          <div><EButton onClick={() => call('clusters.connect', { cluster: c.id, vpn_only: true })
            .catch(() => {})}>{copy.connectVpn(c)}</EButton></div>
        )}
      </Step>
      {s.error && <p className="pb-2 text-sm text-bad">{s.error}</p>}
    </div>
  )
}

/** One step: a number (a check once done), its title, and its content only while it is the open one. */
function Step({ n, state, title, done, change, onOpen, last, children }: {
  n: number; state: 'done' | 'open' | 'later'; title: string; done: string; change?: string; onOpen?: () => void
  last?: boolean; children: ReactNode
}) {
  const mark = state === 'done' ? 'border-[1.5px] border-line-strong text-text'
    : state === 'open' ? 'bg-accent text-on-accent' : 'border-[1.5px] border-line-strong text-dim'
  return (
    <div className="flex gap-4 py-3">
      <div className="flex flex-col items-center">
        <span className={`grid size-7 shrink-0 place-items-center rounded-full text-sm font-semibold ${mark}`}>
          {state === 'done' ? <Check size={16} strokeWidth={2.5} /> : n}</span>
        {!last && <span className="mt-1 -mb-3 w-px flex-1 bg-line" />}
      </div>
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex items-baseline gap-3">
          <div className={`min-w-0 flex-1 ${state === 'open' ? 'font-semibold' : state === 'later' ? 'text-dim' : ''}`}>
            {title}</div>
          {state === 'done' && onOpen && change && <button type="button" onClick={onOpen}
            className="-my-1 rounded-md px-2 py-1 font-semibold underline-offset-2 hover:underline">{change}</button>}
        </div>
        {state === 'done' && done && <div className="text-sm text-dim">{done}</div>}
        {state === 'open' && <div className="mt-3 flex flex-col gap-3 pb-1">{children}</div>}
      </div>
    </div>
  )
}
