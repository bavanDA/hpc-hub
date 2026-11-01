// "Add to" on one of HPC Hub's own skills: tick the agents that should get it (those without it are ticked).
import { ChevronDown } from 'lucide-react'
import { useCallback, useRef, useState } from 'react'

import type { Target } from '../../types/skills'
import { Check } from '../permissions/controls'
import { Popover } from '../terminals/Popover'
import { Button, Spinner } from '../ui'

export function AddTo({ name, targets, has, busy, onAdd }:
  { name: string; targets: Target[]; has: string[]; busy: boolean; onAdd: (targets: string[]) => void }) {
  const button = useRef<HTMLButtonElement>(null)
  const [at, setAt] = useState<{ x: number; y: number } | null>(null)
  const [picked, setPicked] = useState<string[]>([])
  const close = useCallback(() => setAt(null), [])
  const open = () => {
    const r = button.current!.getBoundingClientRect()
    setPicked(targets.map((t) => t.id).filter((t) => !has.includes(t)))
    const tall = 52 + 36 * targets.length  // opens upward near the bottom of the window
    setAt({ x: r.right - 220, y: r.bottom + 6 + tall > window.innerHeight ? r.top - 6 - tall : r.bottom + 6 })
  }
  const tick = (id: string, on: boolean) => setPicked((p) => on ? [...p, id] : p.filter((x) => x !== id))
  return (
    <>
      <button ref={button} onMouseDown={(e) => at && e.stopPropagation()} disabled={busy}
        onClick={(e) => { e.stopPropagation(); if (at) close(); else open() }}
        aria-label={`Add ${name} to`} className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md px-3
          font-semibold hover:bg-hover disabled:opacity-50 ${at ? 'bg-selected' : ''}`}>
        {busy && <Spinner size={14} />}Add to<ChevronDown size={16} />
      </button>
      {at && (
        <Popover x={at.x} y={at.y} onClose={close}>
          <div className="flex w-[205px] flex-col gap-0.5 p-1">
            {targets.map((t) => (
              <label key={t.id} className="flex h-9 items-center gap-2.5 rounded-md px-2 hover:bg-hover">
                <Check on={picked.includes(t.id)} onChange={(v) => tick(t.id, v)} label={t.label} />
                <span className="flex-1">{t.label}</span>
                {has.includes(t.id) && <span className="text-sm text-dim">has it</span>}
              </label>
            ))}
            <Button kind="suggested" className="mt-1.5" disabled={!picked.length}
              onClick={() => { close(); onAdd(picked) }}>Add</Button>
          </div>
        </Popover>
      )}
    </>
  )
}
