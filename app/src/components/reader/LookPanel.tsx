import { ChevronDown, Minus, Plus } from 'lucide-react'

import { Choice } from './Choice'
import { BACKGROUNDS, FONTS, SIZES, type Look } from './look'
import { useOutside } from './useOutside'

export function LookPanel({ look, set, hasSource, onClose }:
  { look: Look; set: (c: Partial<Look> | null) => void; hasSource: boolean; onClose: () => void }) {
  const box = useOutside(onClose)
  const dark = document.documentElement.dataset.theme === 'dark'
  const bg = look.bg || (dark ? 'black' : 'white')
  return (
    <div ref={box} role="dialog" aria-label="Reading settings" className="absolute top-2 right-3 z-30 max-h-[calc(100%-16px)]
      w-[348px] max-w-[calc(100%-24px)] overflow-y-auto rounded-xl bg-raised px-4 pt-1.5 pb-2.5 text-sm
      shadow-[var(--shadow-menu)]">
      <div className="flex min-h-10 items-center justify-between border-b border-line">
        <span className="text-xs font-semibold tracking-wide text-dim uppercase">Reading</span>
        <button onClick={() => set(null)} className="rounded-md px-1.5 py-0.5 text-dim hover:bg-hover hover:text-text">
          Reset</button>
      </div>
      <div className="border-b border-line py-3">
        <div className="mb-2">Font</div>
        <div role="radiogroup" aria-label="Font" className="grid grid-cols-3 gap-1.5">
          {FONTS.map((f) => (
            <button key={f.id} role="radio" aria-checked={look.font === f.id} onClick={() => set({ font: f.id })}
              className={`flex h-14 flex-col justify-center rounded-lg border px-2.5 text-left ${look.font === f.id
                ? 'border-transparent shadow-[0_0_0_2px_var(--color-text)]' : 'border-line hover:bg-hover'}`}>
              <span className="text-xl leading-6" style={{ fontFamily: f.family }}>Ag</span>
              <span className="truncate text-xs text-dim">{f.label}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="flex min-h-11 items-center justify-between border-b border-line">
        <span>Size</span>
        <div className="flex h-[30px] items-center rounded-[7px] bg-control">
          <button aria-label="Smaller" disabled={look.size <= SIZES.min} onClick={() => set({ size: look.size - 1 })}
            className="grid h-[30px] w-[34px] place-items-center rounded-[7px] hover:bg-hover disabled:opacity-40">
            <Minus size={14} /></button>
          <b className="min-w-[34px] text-center text-sm font-semibold tabular-nums">{look.size}</b>
          <button aria-label="Bigger" disabled={look.size >= SIZES.max} onClick={() => set({ size: look.size + 1 })}
            className="grid h-[30px] w-[34px] place-items-center rounded-[7px] hover:bg-hover disabled:opacity-40">
            <Plus size={14} /></button>
        </div>
      </div>
      <Choice label="Line spacing" value={look.spacing} onPick={(v) => set({ spacing: v })}
        options={[['tight', 'Tight'], ['normal', 'Normal'], ['loose', 'Loose']]} />
      <Choice label="Page width" value={look.width} onPick={(v) => set({ width: v })}
        options={[['narrow', 'Narrow'], ['medium', 'Medium'], ['wide', 'Wide']]} />
      <div className={`flex min-h-[62px] items-center justify-between ${hasSource ? 'border-b border-line' : ''}`}>
        <span>Background</span>
        <div role="radiogroup" aria-label="Background" className="flex gap-3">
          {BACKGROUNDS.map((b) => (
            <button key={b.id} role="radio" aria-checked={bg === b.id} aria-label={b.label} title={b.label}
              onClick={() => set({ bg: b.id })} style={{ background: b.color }}
              className={`relative size-[26px] rounded-full shadow-[inset_0_0_0_1px_rgb(0_0_0/0.14)] ${bg === b.id
                ? 'after:absolute after:-inset-1 after:rounded-full after:shadow-[0_0_0_2px_var(--color-text)]' : ''}`} />
          ))}
        </div>
      </div>
      {hasSource && (
        <div className="flex min-h-11 items-center justify-between">
          <span>Math</span>
          <div className="relative">
            <select aria-label="Math" value={look.math} onChange={(e) => set({ math: e.target.value as Look['math'] })}
              className="h-[30px] appearance-none rounded-md bg-control pr-7 pl-2.5 text-sm outline-none">
              <option value="source">From the LaTeX source</option>
              <option value="pdf">Cut from the PDF</option>
            </select>
            <ChevronDown size={14} className="pointer-events-none absolute top-2 right-2" />
          </div>
        </div>
      )}
    </div>
  )
}
