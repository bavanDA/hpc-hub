import { X } from 'lucide-react'
import type { ReactNode } from 'react'

import type { SavedSetting } from '../../../../types/history'
import { useOutside } from '../../useOutside'

export function SavedSettings({ value, user, branch, onPick, onClose }:
  { value: SavedSetting; user: string; branch: string; onPick: (v: SavedSetting) => void; onClose: () => void }) {
  const box = useOutside(true, onClose)
  const option = (v: SavedSetting, title: ReactNode, text?: ReactNode) => (
    <button onClick={() => onPick(v)} role="radio" aria-checked={value === v}
      className={`flex w-full gap-3 rounded-xl border p-3.5 text-left ${value === v ? 'border-text ring-1 ring-text'
        : 'border-line-strong hover:bg-hover'}`}>
      <span className={`mt-0.5 grid size-[18px] shrink-0 place-items-center rounded-full border-2 ${value === v
        ? 'border-text' : 'border-line-strong'}`}>{value === v && <span className="size-2 rounded-full bg-text" />}</span>
      <span className="min-w-0 flex-1"><span className="block font-semibold">{title}</span>
        {text && <span className="mt-0.5 block text-sm text-dim">{text}</span>}</span>
    </button>
  )
  return (
    <div ref={box} className="menu-in absolute top-full left-0 z-30 mt-1.5 w-[400px] rounded-xl border border-line bg-raised
      p-4 shadow-xl">
      <div className="flex items-center"><h3 className="flex-1 font-semibold">Saved versions</h3>
        <button onClick={onClose} aria-label="Close" className="grid size-7 place-items-center rounded-md text-dim
          hover:bg-hover"><X size={15} /></button></div>
      <p className="mt-1 text-sm text-dim">HPC Hub keeps a version on every save and compile, at most every 5 minutes.
        They stay out of your commits and are never part of a normal push.</p>
      <div role="radiogroup" className="mt-3 flex flex-col gap-2">
        {option('off', 'Off')}
        {option('cluster', <>Keep on the cluster <span className="font-normal text-dim">default</span></>,
          'In this repository on the cluster, next to your branches but not one of them.')}
        {option('backup', 'Also push to a backup branch', <>Sent to origin as <span className="font-mono">
          saved/{user || 'you'}/{branch || 'main'}</span>. Co-authors can see that branch.</>)}
      </div>
      <div className="mt-3 flex items-center text-sm"><span className="flex-1">Clear versions older than</span>
        <span className="rounded-md bg-pill px-2.5 py-1">30 days</span></div>
    </div>
  )
}
