import { Check, Copy, ExternalLink, FolderOpen, Info, KeyRound, ShieldCheck } from 'lucide-react'
import { useState } from 'react'

import { call } from '../../rpc'
import { BUSY, type KeyTest } from '../../types/clusters'
import { EButton } from '../e/EButton'
import { Spinner } from '../ui/Spinner'
import { KeyStep } from './KeyStep'
import { KeyTestResult } from './KeyTestResult'
import { copy, fill, who } from './loginCopy'
import { S } from './loginStrings'
import { ownVpnLogin } from './settings/changes'
import { useClusters } from './store'
import { useCameUp, useKeyPageReach } from './keyPageReach'
import { useKeySignIn, type PanelProps } from './useKeySignIn'

const KEY = 0, ADD = 1, TEST = 2

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
  // the key page only opens on the cluster's network (Yale): until it answers, step 2 is only "Connect to Yale's
  // VPN". Asked every second, so Yale's own VPN app or campus count too; once it answers, the page opens by itself.
  const session = useClusters().sessions[c.id]
  const vpnUp = session?.state === 'Connected'
  const vpnBusy = !!session && BUSY.includes(session.state)
  const [vpnError, setVpnError] = useState('')
  const watching = c.vpn.enabled && !!c.key_page && at === ADD && !vpnUp
  const reach = useKeyPageReach(c.id, watching)
  const onNet = vpnUp || (watching && reach === true)
  const needVpn = c.vpn.enabled && !onNet
  // seen only while step 2 watches (or the VPN is up): reopening the step on the network isn't "just connected"
  const seen = !c.vpn.enabled ? null : vpnUp ? true : watching ? reach : null
  useCameUp(seen, () => { if (at === ADD) s.openPage() })
  // a VPN that signs in with the username needs it first; one with a login of its own (Yale's Microsoft page) asks
  // for that on its page, so nothing is asked here (2026-11-22, owner: "why do you ask for username when you
  // don't need that")
  const askUser = !ownVpnLogin(c.vpn) && !known
  const ready = !askUser || !!user.trim()
  // the VPN signs in with the username (Yale: the NetID), typed here when step 3 hasn't had it yet; a failure is
  // said, never swallowed (2026-11-22: "connect Yale VPN doesn't work" showed nothing)
  const connectVpn = () => {
    setVpnError('')
    call('clusters.connect', { cluster: c.id, vpn_only: true, username: user.trim() })
      .catch((e: Error) => setVpnError(e.message))
  }

  return (
    <div className="flex flex-col">
      <KeyStep n={1} state={state(KEY)} title={state(KEY) === 'done' ? S.STEP_KEY_DONE : S.STEP_KEY} done={keyLine}
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
      </KeyStep>
      <KeyStep n={2} state={state(ADD)} title={fill(S.STEP_ADD, { who: org })} done={S.PASTED} change={S.CHANGE}
        onOpen={() => setOpen(ADD)}>
        {s.key && <>
          {!needVpn && <div className="flex h-10 items-center gap-2 rounded-lg border border-line-strong pr-1 pl-3">
            <code className="min-w-0 flex-1 truncate font-mono text-xs text-dim" title={s.key.public}>
              {s.key.public}</code>
            <EButton kind="quiet" icon={s.copied ? Check : Copy} onClick={s.copyKey} className="h-8 px-2.5 text-sm">
              {s.copied ? S.COPIED : S.COPY_KEY}</EButton>
          </div>}
          {needVpn ? <>
            <p>{fill(S.VPN_FIRST, { who: org })}</p>
            {askUser && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="vpn-user" className="text-sm text-dim">{c.username_label || 'Username'}</label>
                <input id="vpn-user" value={user} spellCheck={false} autoComplete="username"
                  placeholder={copy.usernameHint}
                  onChange={(e) => { onUser(e.target.value); setVpnError('') }}
                  onKeyDown={(e) => { if (e.key === 'Enter' && ready && !vpnBusy) { e.preventDefault(); connectVpn() } }}
                  className="h-10 rounded-lg border border-line-strong bg-window px-3 outline-none
                    placeholder:text-faint focus:border-accent focus:ring-1 focus:ring-accent" />
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <EButton icon={vpnBusy ? undefined : ShieldCheck} onClick={connectVpn}
                disabled={vpnBusy || !ready}>
                {vpnBusy && <Spinner />}{copy.connectVpn(c)}</EButton>
            </div>
            {!vpnBusy && <p className="text-sm text-dim">{fill(S.VPN_WATCH, { who: org })}</p>}
            {vpnBusy && session?.detail && <p className="text-sm text-dim">{session.detail}</p>}
            {session?.state === 'Error' && session.detail && <p className="text-sm text-bad">{session.detail}</p>}
            {vpnError && <p className="text-sm text-bad">{vpnError}</p>}
          </> : <>
            <p>{fill(S.PASTE_IT, { who: org })}</p>
            <div className="flex flex-wrap items-center gap-2">
              <EButton onClick={s.openPage}>{S.OPEN_PAGE}<ExternalLink size={16} /></EButton>
              <EButton onClick={toTest}>{S.PASTED_IT}</EButton>
            </div>
            {c.vpn.enabled && vpnUp ? <p className="flex gap-2 text-sm text-dim">
              <ShieldCheck size={14} className="mt-[3px] shrink-0" />{fill(S.VPN_UP, { who: org })}</p>
              : c.key_page_note && <p className="flex gap-2 text-sm text-dim">
                <Info size={14} className="mt-[3px] shrink-0" />{c.key_page_note}</p>}
          </>}
        </>}
      </KeyStep>
      <KeyStep n={3} state={state(TEST)} title={S.STEP_TEST} done={fill(S.SIGNED_IN_AS, { user: user.trim() })}
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
        {s.test && !works && <KeyTestResult test={s.test} text={said(s.test, org)} />}
        {s.test?.reason === 'no_vpn' && c.vpn.enabled && (
          <div className="flex flex-col gap-1.5"><div><EButton onClick={connectVpn}>{copy.connectVpn(c)}</EButton></div>
            {vpnError && <p className="text-sm text-bad">{vpnError}</p>}</div>
        )}
      </KeyStep>
      {s.error && <p className="pb-2 text-sm text-bad">{s.error}</p>}
    </div>
  )
}
