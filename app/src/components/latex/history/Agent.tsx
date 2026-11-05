// One agent choice for Write message, Ask and Check my list: a chip in the bar under the commit list ("Haiku · Low")
// opening a small panel with three presets (Fast, Careful, Thorough), then the agent, its model and its effort.
// Kept for next time, for every paper. The Ask box can pick another one for a single question (PickMenu).
import { Check, ChevronDown, ChevronUp, FlaskConical, MessageSquare, MousePointer2, Star, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import type { AgentChoice, AgentPick, Preset } from '../../../types/history'
import { Switch } from '../../ui'
import { chipLabel } from './useAssist'

const ICONS: Record<string, typeof Star> = { claude: Star, codex: MessageSquare, agy: FlaskConical, cursor: MousePointer2 }

export function AgentIcon({ agent, size = 12 }: { agent: string; size?: number }) {
  const I = ICONS[agent] ?? Star
  return (
    <span className="grid size-[18px] shrink-0 place-items-center rounded-[5px] border border-line-strong text-dim">
      <I size={size} /></span>
  )
}

const PRESETS: [Preset, string, string][] = [
  ['fast', 'Fast', 'about 5 s'], ['careful', 'Careful', 'about 20 s'], ['thorough', 'Thorough', 'a minute or so']]

/** "Haiku, Low" for a preset. */
function presetWords(c: AgentChoice, p: Preset): string {
  const v = c.presets[p], a = c.agents.find((x) => x.id === v.agent)
  return [a?.models.find(([m]) => m === v.model)?.[1], a?.efforts.find(([e]) => e === v.effort)?.[1]]
    .filter(Boolean).join(', ')
}

function useOutside(open: boolean, close: () => void) {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const down = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) close() }
    const key = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('mousedown', down)
    window.addEventListener('keydown', key)
    return () => { window.removeEventListener('mousedown', down); window.removeEventListener('keydown', key) }
  }, [open, close])
  return box
}

type ChipProps = {
  choice: AgentChoice | null
  clusterName: string
  installed: string[] | null
  onOpen: () => void  // look up which agents the cluster has
  onChoose: (p: Partial<AgentPick> & { split?: boolean }) => void
}

/** The chip in the bar under the commit list, and its panel. */
export function AgentChip({ choice, clusterName, installed, onOpen, onChoose }: ChipProps) {
  const [open, setOpen] = useState(false)
  const box = useOutside(open, () => setOpen(false))
  if (!choice) return null
  return (
    <div ref={box} className="relative shrink-0">
      <button onClick={() => { if (!open) onOpen(); setOpen(!open) }} title="The agent for Write message, Ask and Check my list"
        className={`flex h-8 items-center gap-1.5 rounded-md px-1.5 text-sm font-semibold ${open ? 'bg-selected' : 'hover:bg-hover'}`}>
        <AgentIcon agent={choice.agent} /> <span className="max-w-[120px] truncate">{chipLabel(choice, choice.agents)}</span>
        {open ? <ChevronDown size={13} className="text-dim" /> : <ChevronUp size={13} className="text-dim" />}</button>
      {open && <AgentPanel choice={choice} clusterName={clusterName} installed={installed} onChoose={onChoose}
        onClose={() => setOpen(false)} />}
    </div>
  )
}

const SELECT = 'h-8 max-w-[200px] cursor-pointer appearance-none rounded-md bg-pill pr-7 pl-2.5 text-sm font-semibold '
  + 'outline-none hover:bg-pressed focus:ring-2 focus:ring-focus'

function Select({ label, value, options, onChange }:
  { label: string; value: string; options: [string, string][]; onChange: (v: string) => void }) {
  return (
    <span className="relative">
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className={SELECT}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      <ChevronDown size={14} className="pointer-events-none absolute top-2 right-2 text-dim" />
    </span>
  )
}

function AgentPanel({ choice, clusterName, installed, onChoose, onClose }:
  { choice: AgentChoice; clusterName: string; installed: string[] | null
    onChoose: ChipProps['onChoose']; onClose: () => void }) {
  const agent = choice.agents.find((a) => a.id === choice.agent)
  const pickAgent = (id: string) => {
    const a = choice.agents.find((x) => x.id === id)
    if (!a) return
    const has = (list: [string, string][], v: string) => list.some(([x]) => x === v)
    onChoose({ agent: id, model: has(a.models, choice.model) ? choice.model : a.models.find(([v]) => v)?.[0] ?? '',
      effort: has(a.efforts, choice.effort) ? choice.effort : has(a.efforts, 'low') ? 'low' : '' })
  }
  const row = 'flex min-h-11 items-center gap-3 border-t border-line first:border-t-0'
  return (
    <div className="menu-in absolute bottom-full left-0 z-30 mb-2 w-[440px] rounded-xl border border-line bg-raised px-[18px]
      pt-4 pb-3.5 shadow-[var(--shadow-dialog)]">
      <div className="flex items-center"><b className="flex-1 text-[15px]">Agent</b>
        <button onClick={onClose} aria-label="Close" className="grid size-7 place-items-center rounded-md text-dim hover:bg-hover">
          <X size={15} /></button></div>
      <p className="mt-0.5 mb-3 text-[13px] leading-[18px] text-dim">One choice for Write message, Ask and Check my list.
        Kept for next time.</p>
      <div className="flex gap-2" role="radiogroup" aria-label="Presets">
        {PRESETS.map(([p, name, time]) => {
          const on = choice.preset === p
          return (
            <button key={p} role="radio" aria-checked={on} onClick={() => onChoose(choice.presets[p])}
              className={`flex-1 rounded-[10px] px-2.5 py-2 text-left ${on ? 'ring-[1.5px] ring-accent'
                : 'ring-1 ring-line-strong ring-inset hover:bg-hover'}`}>
              <span className="flex items-center gap-1.5 text-[13.5px] font-semibold">{name}
                <span className="flex-1" />{on && <Check size={14} />}</span>
              <span className="mt-0.5 block text-xs leading-4 text-dim">{presetWords(choice, p)}<br />{time}</span>
            </button>
          )
        })}
      </div>
      <div className="mt-3">
        <div className={row}><span className="flex-1">Agent</span>
          <Select label="Agent" value={choice.agent} onChange={pickAgent}
            options={choice.agents.map((a) => [a.id, installed && !installed.includes(a.id) ? `${a.name} (not found on ${clusterName})`
              : a.name])} /></div>
        {agent && agent.models.length > 0 && <div className={row}><span className="flex-1">Model</span>
          <Select label="Model" value={choice.model} options={agent.models} onChange={(model) => onChoose({ model })} /></div>}
        {agent && agent.efforts.length > 0 && <div className={row}><span className="flex-1">Effort</span>
          <Select label="Effort" value={choice.effort} options={agent.efforts} onChange={(effort) => onChoose({ effort })} /></div>}
        <div className={row}><span className="flex-1">Suggest several commits</span>
          <Switch on={choice.split} onChange={(split) => onChoose({ split })} label="Suggest several commits" /></div>
      </div>
      <p className="mt-2 text-xs leading-4 text-dim">Runs on your compute node on {clusterName}. Model and Effort show only
        what the agent offers: Cursor has models, ChatGPT and Antigravity have effort.</p>
    </div>
  )
}

/** For one question only: your usual choice or a preset. */
export function PickMenu({ choice, value, onPick }:
  { choice: AgentChoice; value: AgentPick | null; onPick: (p: AgentPick | null) => void }) {
  const [open, setOpen] = useState(false)
  const box = useOutside(open, () => setOpen(false))
  const now = value ?? choice
  const item = (key: string, label: string, hint: string, on: boolean, pick: AgentPick | null) => (
    <button key={key} onClick={() => { onPick(pick); setOpen(false) }}
      className="flex h-9 w-full items-center gap-2 rounded-md px-2.5 text-left text-sm hover:bg-hover">
      <span className="w-4">{on && <Check size={14} />}</span><span className="font-semibold">{label}</span>
      <span className="text-dim">{hint}</span></button>
  )
  return (
    <div ref={box} className="relative shrink-0">
      <button onClick={() => setOpen(!open)} title="The agent for this question"
        className="flex h-9 items-center gap-1.5 rounded-lg bg-pill px-2.5 text-sm font-semibold hover:bg-pressed">
        <AgentIcon agent={now.agent} /> {chipLabel(now, choice.agents)} <ChevronDown size={14} className="text-dim" /></button>
      {open && (
        <div className="menu-in absolute right-0 bottom-full z-30 mb-1.5 w-[300px] rounded-xl border border-line bg-raised p-1.5
          shadow-[var(--shadow-dialog)]">
          {item('usual', 'Your usual', chipLabel(choice, choice.agents), !value, null)}
          {PRESETS.map(([p, name]) => item(p, name, presetWords(choice, p),
            !!value && value.agent === choice.presets[p].agent && value.model === choice.presets[p].model
              && value.effort === choice.presets[p].effort, choice.presets[p]))}
        </div>
      )}
    </div>
  )
}
