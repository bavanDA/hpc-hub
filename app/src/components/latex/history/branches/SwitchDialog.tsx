import { CircleAlert, CircleCheck } from 'lucide-react'
import { type ReactNode, useState } from 'react'

import type { SwitchCheck } from '../../../../types/history'
import { Button } from '../../../ui/Button'
import { Dialog } from '../../../ui/Dialog'

export function SwitchDialog({ check, clusterName, onClose, onSwitch, onCommitFirst }:
  { check: SwitchCheck; clusterName: string; onClose: () => void; onSwitch: (mode: 'bring' | 'keep') => void
    onCommitFirst: () => void }) {
  const [pick, setPick] = useState<'bring' | 'keep' | 'commit'>(check.bring ? 'bring' : 'keep')
  const from = check.from || 'this branch'
  const clash = check.clash[0]
  const option = (v: typeof pick, title: string, text: ReactNode, disabled = false) => (
    <button onClick={() => setPick(v)} disabled={disabled} role="radio" aria-checked={pick === v}
      className={`flex w-full gap-3 rounded-xl border p-4 text-left disabled:opacity-50 ${pick === v
        ? 'border-text ring-1 ring-text' : 'border-line-strong hover:bg-hover'}`}>
      <span className={`mt-0.5 grid size-[18px] shrink-0 place-items-center rounded-full border-2 ${pick === v
        ? 'border-text' : 'border-line-strong'}`}>{pick === v && <span className="size-2 rounded-full bg-text" />}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{title}</span>
        <span className="mt-0.5 block text-sm text-dim">{text}</span>
      </span>
    </button>
  )
  return (
    <Dialog title={`Switch to ${check.target}`} onClose={onClose} width={540} actions={<>
      <span className="mr-auto max-w-[260px] text-xs text-dim">Git runs over your connection to {clusterName}. No
        compute node needed.</span>
      <Button onClick={onClose}>Cancel</Button>
      <Button kind="primary" onClick={() => pick === 'commit' ? onCommitFirst() : onSwitch(pick)}>
        {pick === 'commit' ? 'Commit first' : 'Switch'}</Button>
    </>}>
      <p className="text-dim">You have changes not committed yet on <b className="text-text">{from}</b>. What should
        happen to them?</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {check.changes.slice(0, 6).map((c) => (
          <span key={c.path} className="rounded-md bg-pill px-2 py-0.5 font-mono text-xs">{c.path.split('/').pop()}
            {c.new ? <span className="diff-add-ink ml-1">new</span> : <span className="diff-add-ink ml-1">+{c.added}</span>}</span>
        ))}
        {check.changes.length > 6 && <span className="text-xs text-dim">and {check.changes.length - 6} more</span>}
      </div>
      <div role="radiogroup" className="mt-4 flex flex-col gap-2.5">
        {option('bring', 'Bring them along', <>Keep working on them on {check.target}.
          <span className={`mt-1.5 flex items-center gap-1.5 ${check.bring ? 'diff-add-ink' : 'text-bad'}`}>
            {check.bring ? <><CircleCheck size={14} /> Checked: they do not touch anything that differs on that
              branch.</> : <><CircleAlert size={14} /> They clash with {check.target} in {clash.path}
              {clash.line ? `, line ${clash.line}` : ''}.</>}</span></>, !check.bring)}
        {option('keep', `Keep them on ${from}`, <>Put aside with {from}. They come back by themselves when you switch
          back to {from}.</>)}
        {option('commit', `Commit them on ${from} first`, 'Opens the commit box. The switch happens after you commit.')}
      </div>
    </Dialog>
  )
}
