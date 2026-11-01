// Direction C of the key sign-in (signInVariants.ts): a checklist, one line per task with its action on the
// right. Kept only until a direction is picked.
import { Check, CheckCircle2, Copy, ExternalLink, KeyRound } from 'lucide-react'
import type { ReactNode } from 'react'

import { Button, Spinner } from '../ui'
import { useKeySignIn, Result, type PanelProps } from './KeyPanel'
import { copy, who } from './loginCopy'
import { C } from './signInVariants'

export function KeyChecklist(props: PanelProps) {
  const { cluster: c, user, onUser } = props
  const s = useKeySignIn(props)
  const works = !!s.test?.ok
  const done = [!!s.key, s.added, works].filter(Boolean).length
  return (
    <div className="rounded-xl bg-card px-5 py-2 shadow-[var(--shadow-card)]">
      <p className="py-2 text-[13px] text-dim">{C.done(done)}</p>
      <Row title={C.key} done={s.key ? C.keyDone : ''}>
        {s.key === undefined ? <Spinner /> : <Button kind="suggested" type="button" onClick={s.make} disabled={s.busy}>
          {s.busy ? <Spinner /> : <KeyRound size={16} />}{C.create}</Button>}
      </Row>
      <Row title={C.add(who(c))} done={s.added ? C.addDone : ''} dim={!s.key}>
        {s.key && <div className="flex flex-wrap justify-end gap-2">
          <Button kind="flat" type="button" onClick={s.copyKey}>
            {s.copied ? <><Check size={15} className="text-ok" />{C.copied}</> : <><Copy size={15} />{C.copy}</>}</Button>
          <Button kind="flat" type="button" onClick={s.openPage}>{C.open}<ExternalLink size={14} /></Button>
          <Button kind="suggested" type="button" onClick={() => s.setAdded(true)}>{C.mark}</Button>
        </div>}
      </Row>
      <Row title={C.test} done={works ? C.testDone : ''} dim={!s.added}>
        {s.key && s.added && <div className="flex gap-2">
          <input value={user} placeholder={c.username_label || copy.usernameHint} spellCheck={false}
            autoComplete="username" aria-label={c.username_label || 'Username'}
            onChange={(e) => { onUser(e.target.value); s.clearTest() }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (user.trim()) s.check() } }}
            className="h-9 w-36 rounded-md border border-line bg-pill px-3 outline-none placeholder:text-dim
              focus:border-accent focus:ring-2 focus:ring-accent/30" />
          <Button kind="suggested" type="button" onClick={s.check} disabled={!user.trim() || s.busy}>
            {s.busy && <Spinner />}{C.check}</Button>
        </div>}
      </Row>
      {s.busy && c.second_factor !== 'code' && <p className="pb-2 text-[13px] text-dim">{C.duoNow}</p>}
      {s.test && !works && <div className="pb-3"><Result test={s.test} text={C.result(s.test, who(c))} /></div>}
      {s.error && <p className="pb-2 text-[13px] text-bad">{s.error}</p>}
    </div>
  )
}

function Row({ title, done, dim, children }: { title: string; done: string; dim?: boolean; children: ReactNode }) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-4 border-t border-line py-2.5 first-of-type:border-t-0">
      {done
        ? <span className="flex items-center gap-2 font-bold text-ok"><CheckCircle2 size={17} />{done}</span>
        : <span className={dim ? 'text-dim' : ''}>{title}</span>}
      {!done && children}
    </div>
  )
}
