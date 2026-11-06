// The agent for Write message, Ask and Check my list: a chip in the bar under the commit list ("Opus · High")
// opening a small panel with the agent (picked in Settings), then its model and its effort, two separate choices.
// Kept for next time, for every paper. The Ask box can pick another model and effort for a single question (PickMenu).
import { Check, ChevronDown, ChevronUp, FlaskConical, MessageSquare, MousePointer2, Star, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import type { AgentChoice, AgentDesc, AgentLevel } from '../../../types/history'
import { openSettings } from '../../app/openSettings'
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

const SELECT = 'h-8 max-w-[220px] cursor-pointer appearance-none rounded-md bg-pill pr-7 pl-2.5 text-sm font-semibold '
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

/** One of a few side by side; a dropdown when there are too many to fit (Cursor's models). */
function Choices({ label, value, options, onChange }:
  { label: string; value: string; options: [string, string][]; onChange: (v: string) => void }) {
  if (options.length > 6) return <Select label={label} value={value} options={options} onChange={onChange} />
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-[3px] rounded-lg border border-line-strong p-[3px]">
      {options.map(([v, text]) => {
        const on = v === value
        return (
          <button key={v} type="button" role="radio" aria-checked={on} onClick={() => onChange(v)}
            className={`h-7 flex-auto rounded-md px-2 text-[13px] whitespace-nowrap ${on
              ? 'bg-accent font-semibold text-on-accent' : 'font-medium text-dim hover:bg-hover active:bg-pressed'}`}>
            {text}</button>
        )
      })}
    </div>
  )
}

/** Model and Effort, each its own choice from what the agent offers; words when it has no such setting. */
function Levels({ agent, value, onChange }:
  { agent: AgentDesc | undefined; value: AgentLevel; onChange: (p: Partial<AgentLevel>) => void }) {
  const block = 'border-t border-line py-2.5'
  const none = (text: string) => <p className="text-sm text-dim">{text}</p>
  return (
    <>
      <div className={block}>
        <div className="mb-1.5 text-sm">Model</div>
        {agent && agent.models.length > 0
          ? <Choices label="Model" value={value.model} options={agent.models} onChange={(model) => onChange({ model })} />
          : none('Its default model')}
      </div>
      <div className={block}>
        <div className="mb-1.5 text-sm">Effort</div>
        {agent && agent.efforts.length > 0
          ? <Choices label="Effort" value={value.effort} options={agent.efforts} onChange={(effort) => onChange({ effort })} />
          : none('Its default effort')}
      </div>
    </>
  )
}

type ChipProps = {
  choice: AgentChoice | null
  clusterName: string
  installed: string[] | null
  onOpen: () => void  // look up which agents the cluster has
  onChoose: (p: Partial<AgentLevel> & { split?: boolean }) => void
}

/** The chip in the bar under the commit list, and its panel. */
export function AgentChip({ choice, clusterName, installed, onOpen, onChoose }: ChipProps) {
  const [open, setOpen] = useState(false)
  const box = useOutside(open, () => setOpen(false))
  if (!choice) return null
  return (
    <div ref={box} className="relative shrink-0">
      <button onClick={() => { if (!open) onOpen(); setOpen(!open) }} title="The model and effort for Write message, Ask and Check my list"
        className={`flex h-8 items-center gap-1.5 rounded-md px-1.5 text-sm font-semibold ${open ? 'bg-selected' : 'hover:bg-hover'}`}>
        <AgentIcon agent={choice.agent} /> <span className="max-w-[140px] truncate">{chipLabel(choice, choice.agents)}</span>
        {open ? <ChevronDown size={13} className="text-dim" /> : <ChevronUp size={13} className="text-dim" />}</button>
      {open && <AgentPanel choice={choice} clusterName={clusterName} installed={installed} onChoose={onChoose}
        onClose={() => setOpen(false)} />}
    </div>
  )
}

function AgentPanel({ choice, clusterName, installed, onChoose, onClose }:
  { choice: AgentChoice; clusterName: string; installed: string[] | null
    onChoose: ChipProps['onChoose']; onClose: () => void }) {
  const agent = choice.agents.find((a) => a.id === choice.agent)
  const missing = !!installed && !installed.includes(choice.agent)
  return (
    <div className="menu-in absolute bottom-full left-0 z-30 mb-2 w-[460px] rounded-xl border border-line bg-raised px-[18px]
      pt-4 pb-3.5 shadow-[var(--shadow-dialog)]">
      <div className="flex items-center"><b className="flex-1 text-[15px]">Agent</b>
        <button onClick={onClose} aria-label="Close" className="grid size-7 place-items-center rounded-md text-dim hover:bg-hover">
          <X size={15} /></button></div>
      <p className="mt-0.5 mb-3 text-[13px] leading-[18px] text-dim">Writes commit messages, answers questions about
        changes and checks your notes. Kept for every paper.</p>
      <div className="flex min-h-11 items-center gap-3 border-t border-line">
        <AgentIcon agent={choice.agent} />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{agent?.name ?? choice.agent}</span>
          {missing && <span className="block text-xs text-dim">Not found on {clusterName}</span>}
        </span>
        <button onClick={() => { onClose(); openSettings() }}
          className="h-8 rounded-md px-2 text-sm text-dim underline underline-offset-2 hover:bg-hover hover:text-text">
          Change in Settings</button>
      </div>
      <Levels agent={agent} value={choice} onChange={onChoose} />
      <div className="flex min-h-11 items-center gap-3 border-t border-line"><span className="flex-1">Suggest several commits</span>
        <Switch on={choice.split} onChange={(split) => onChoose({ split })} label="Suggest several commits" /></div>
      <p className="mt-1 text-xs leading-4 text-dim">Runs on your compute node on {clusterName}.</p>
    </div>
  )
}

/** For one question only: another model and effort of your agent, or your usual ones. */
export function PickMenu({ choice, value, onPick }:
  { choice: AgentChoice; value: AgentLevel | null; onPick: (p: AgentLevel | null) => void }) {
  const [open, setOpen] = useState(false)
  const box = useOutside(open, () => setOpen(false))
  const now = { ...choice, ...value }
  const agent = choice.agents.find((a) => a.id === choice.agent)
  const pick = (p: Partial<AgentLevel>) => {
    const next = { model: now.model, effort: now.effort, ...p }
    onPick(next.model === choice.model && next.effort === choice.effort ? null : next)
  }
  return (
    <div ref={box} className="relative shrink-0">
      <button onClick={() => setOpen(!open)} title="The model and effort for this question"
        className="flex h-9 items-center gap-1.5 rounded-lg bg-pill px-2.5 text-sm font-semibold hover:bg-pressed">
        <AgentIcon agent={choice.agent} /> {chipLabel(now, choice.agents)} <ChevronDown size={14} className="text-dim" /></button>
      {open && (
        <div className="menu-in absolute right-0 bottom-full z-30 mb-1.5 w-[420px] rounded-xl border border-line bg-raised
          px-4 pt-3 pb-1.5 font-sans shadow-[var(--shadow-dialog)]">
          <div className="flex items-center gap-2 pb-2.5">
            <span className="min-w-0 flex-1">
              <b className="block text-sm">For this question</b>
              <span className="block text-xs text-dim">{agent?.name ?? choice.agent}. Your usual is
                {` ${chipLabel(choice, choice.agents)}`}.</span>
            </span>
            {value
              ? <button onClick={() => { onPick(null); setOpen(false) }}
                  className="h-8 rounded-md bg-pill px-2.5 text-sm font-semibold hover:bg-pressed">Back to your usual</button>
              : <span className="flex items-center gap-1.5 text-sm text-dim"><Check size={14} /> Your usual</span>}
          </div>
          <Levels agent={agent} value={now} onChange={pick} />
        </div>
      )}
    </div>
  )
}
