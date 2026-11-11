// A cluster that takes an SSH key: the desktop's three steps (components/clusters/KeyPanel.tsx) in the phone's words,
// with a QR code of the public key so a computer can read it off the phone. The key comes from keys.create; "Use a key
// I already have" picks one with Android's file picker and keeps it in ~/.ssh (keys.use).
import { Check, Copy, ExternalLink, FolderOpen, Info, KeyRound } from 'lucide-react'
import { useEffect, useState } from 'react'

import { inTauri } from '@shared/components/app/platform'
import { KeyStep } from '@shared/components/clusters/KeyStep'
import { KeyTestResult } from '@shared/components/clusters/KeyTestResult'
import { copy, fill, who } from '@shared/components/clusters/loginCopy'
import { S } from '@shared/components/clusters/loginStrings'
import { pickKeyFile } from '@shared/components/clusters/pickKeyFile'
import { useKeySignIn, type PanelProps } from '@shared/components/clusters/useKeySignIn'
import { Spinner } from '@shared/components/ui/Spinner'
import { call } from '@shared/rpc'
import type { KeyTest, MyKey } from '@shared/types/clusters'
import { Button, useToast } from '../../ui'
import { pickFiles } from '../native'

const KEY = 0, ADD = 1, TEST = 2

const here = (t: string) => t.replace('this computer', 'this phone')
const said = (t: KeyTest, org: string) =>
  here(fill((S.TEST as Record<string, string>)[t.reason ?? ''] ?? t.text, { who: org, last: t.last ?? '' }).trim())

/** Asked here so the backend draws it (hpc_hub/vendor/qrcodegen.py), dark on white for the camera. */
function PublicKeyQr({ cluster, keyLine }: { cluster: string; keyLine: string }) {
  const [svg, setSvg] = useState('')
  useEffect(() => {
    call<string | null>('keys.qr', { cluster }).then((got) => setSvg(got ?? '')).catch(() => setSvg(''))
  }, [cluster, keyLine])
  if (!svg) return null
  return (
    <div className="flex items-center gap-3">
      <img src={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`} alt="QR code of the public key"
        className="size-[120px] shrink-0 rounded-lg bg-white p-2 shadow-[0_0_0_1px_var(--color-line)]
          [image-rendering:pixelated]" />
      <p className="text-sm">Scan to get the public key on your computer</p>
    </div>
  )
}

function Steps({ onPicked, ...props }: PanelProps & { onPicked: () => void }) {
  const { cluster: c, user, onUser } = props
  const toast = useToast()
  const s = useKeySignIn(props)
  const [open, setOpen] = useState<number | null>(null)
  const [known, setKnown] = useState(!!props.signedIn)
  const works = !!s.test?.ok || (known && !s.test && !!s.key && s.added)
  const reached = !s.key ? KEY : !s.added ? ADD : works ? TEST + 1 : TEST
  const at = open ?? reached
  const state = (n: number) => (n === at ? 'open' : n < reached ? 'done' : 'later')
  const org = who(c)
  const file = s.key?.file ?? ''
  const keyLine = here(fill(s.how === 'made' ? S.KEY_MADE : s.how === 'picked' ? S.KEY_PICKED : S.KEY_FOUND, { file }))
  const toTest = () => { s.setAdded(true); setOpen(null) }

  async function useMine() {
    try {
      const path = inTauri ? (await pickFiles())[0]?.path : await pickKeyFile()
      if (!path) return
      await call<MyKey>('keys.use', { cluster: c.id, path, temporary: inTauri })
      setOpen(null)
      onPicked()
    } catch (e) {
      toast((e as Error).message)
    }
  }

  return (
    <div className="flex flex-col">
      <KeyStep n={1} state={state(KEY)} title={state(KEY) === 'done' ? S.STEP_KEY_DONE : S.STEP_KEY} done={keyLine}
        change={S.CHANGE} onOpen={() => setOpen(KEY)}>
        {s.key === undefined ? <Spinner /> : (
          <>
            {s.key && <p className="text-sm text-dim">{keyLine}</p>}
            <div className="flex flex-wrap items-center gap-2">
              {!s.key && <Button icon={s.busy ? undefined : KeyRound} onClick={s.make}
                disabled={s.busy}>{s.busy && <Spinner />}{S.CREATE_KEY}</Button>}
              <Button icon={FolderOpen} onClick={useMine}>{S.USE_MINE}</Button>
            </div>
          </>
        )}
      </KeyStep>
      <KeyStep n={2} state={state(ADD)} title={fill(S.STEP_ADD, { who: org })} done={S.PASTED} change={S.CHANGE}
        onOpen={() => setOpen(ADD)}>
        {s.key && <>
          <PublicKeyQr cluster={c.id} keyLine={s.key.public} />
          <div className="flex h-10 items-center gap-2 rounded-lg border border-line-strong pr-1 pl-3">
            <code className="min-w-0 flex-1 truncate font-mono text-xs text-dim">{s.key.public}</code>
            <Button kind="quiet" small icon={s.copied ? Check : Copy} onClick={s.copyKey}>
              {s.copied ? S.COPIED : S.COPY_KEY}</Button>
          </div>
          <p>{fill(S.PASTE_IT, { who: org })}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={s.openPage}>{S.OPEN_PAGE}<ExternalLink size={16} /></Button>
            <Button onClick={toTest}>{S.PASTED_IT}</Button>
          </div>
          {c.key_page_note && <p className="flex gap-2 text-sm text-dim">
            <Info size={14} className="mt-[3px] shrink-0" />{c.key_page_note}</p>}
        </>}
      </KeyStep>
      <KeyStep n={3} state={state(TEST)} title={S.STEP_TEST} done={fill(S.SIGNED_IN_AS, { user: user.trim() })}
        change={S.CHANGE} onOpen={() => setOpen(TEST)} last>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="key-user" className="text-sm text-dim">{c.username_label || 'Username'}</label>
          <div className="flex gap-2">
            <input id="key-user" value={user} placeholder={copy.usernameHint} spellCheck={false} autoCapitalize="none"
              autoComplete="username" autoCorrect="off"
              onChange={(e) => { onUser(e.target.value); setKnown(false); s.clearTest() }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (user.trim()) s.check() } }}
              className="h-10 min-w-0 flex-1 rounded-lg border border-line-strong bg-window px-3 outline-none
                placeholder:text-faint focus:border-accent focus:ring-1 focus:ring-accent" />
            <Button onClick={s.check} disabled={!user.trim() || s.busy}>
              {s.busy && <Spinner />}{s.test && !works ? S.TRY_AGAIN : S.TRY}</Button>
          </div>
        </div>
        {s.busy && c.second_factor !== 'code' && <p className="text-sm text-dim">{S.DUO_NOW}</p>}
        {s.test && !works && <KeyTestResult test={s.test} text={said(s.test, org)} />}
        {s.test?.reason === 'no_vpn' && c.vpn.enabled && (
          <div><Button onClick={() => call('clusters.connect', { cluster: c.id, vpn_only: true, switch: true })
            .catch(() => {})}>{copy.connectVpn(c)}</Button></div>
        )}
      </KeyStep>
      {s.error && <p className="pb-2 text-sm text-bad">{s.error}</p>}
    </div>
  )
}

/** A key picked just now is read again from the backend (keys.mine knows it from then on). */
export function KeySteps(props: PanelProps) {
  const [picked, setPicked] = useState(0)
  return <Steps key={picked} {...props} onPicked={() => setPicked(picked + 1)} />
}
