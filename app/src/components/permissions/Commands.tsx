// "Run without asking": groups of commands to tick, your own commands, and a field to add one.
import { ChevronDown, ChevronRight, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'

import type { CommandGroup } from '../../types/permissions'
import { useToast } from '../toast'
import { Button } from '../ui'
import { Check, Group } from './controls'

/** opens: bump it to open the expander (a command was just added). */
function Expander({ title, note, commands, allowed, onChange, opens = 0 }: {
  title: string; note: string; commands: string[]; allowed: Set<string>
  onChange: (cmds: string[], on: boolean) => void; opens?: number
}) {
  const [open, setOpen] = useState(false)
  useEffect(() => { if (opens) setOpen(true) }, [opens])
  const on = commands.filter((c) => allowed.has(c)).length
  const count = `${on} of ${commands.length} allowed`
  return (
    <div>
      <div onClick={() => setOpen(!open)} className="flex min-h-[56px] items-center gap-3 px-4 py-2 hover:bg-hover">
        <Check on={!!commands.length && on === commands.length} mixed={on > 0 && on < commands.length}
          label={`All of ${title}`} onChange={(v) => onChange(commands, v)} />
        <div className="min-w-0 flex-1">
          <div>{title}</div>
          <div className="text-[13px] text-dim">{note ? `${count}. ${note}` : count}</div>
        </div>
        {open ? <ChevronDown size={16} className="text-dim" /> : <ChevronRight size={16} className="text-dim" />}
      </div>
      {open && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(128px,1fr))] gap-x-2 gap-y-0.5 border-t border-line
          bg-view/40 px-4 py-3">
          {commands.length ? commands.map((c) => (
            <label key={c} className="flex h-8 items-center gap-2.5 rounded-md px-1.5 hover:bg-hover">
              <Check on={allowed.has(c)} onChange={(v) => onChange([c], v)} label={c} />
              <span className="truncate font-mono text-[13px]">{c}</span>
            </label>
          )) : <p className="col-span-full text-[13px] text-dim">None yet. Add one below.</p>}
        </div>
      )}
    </div>
  )
}

export function Commands({ groups, custom, allowed, onChange, onAdd }: {
  groups: CommandGroup[]; custom: string[]; allowed: Set<string>; onChange: (cmds: string[], on: boolean) => void
  onAdd: (cmd: string) => void
}) {
  const toast = useToast()
  const [text, setText] = useState('')
  const [added, setAdded] = useState(0)
  const add = () => {
    const cmd = text.trim().split(/\s+/)[0]
    setText('')
    if (!cmd) return
    if (cmd === 'rm') { toast("rm can't be allowed. Use trash instead"); return }
    if (groups.some((g) => g.commands.includes(cmd)) || custom.includes(cmd)) onChange([cmd], true)
    else { onAdd(cmd); setAdded((n) => n + 1) }
  }
  return (
    <Group title="Run without asking" description="Anything not ticked asks you first">
      {groups.map((g) => <Expander key={g.title} title={g.title} note={g.note} commands={g.commands} allowed={allowed}
        onChange={onChange} />)}
      <Expander opens={added} title="Your own" note="Commands you added"
        commands={custom} allowed={allowed} onChange={onChange} />
      <div className="flex items-center gap-2 px-4 py-3">
        <input value={text} spellCheck={false} placeholder="Add a command, like conda or ./run.sh"
          onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()}
          className="h-9 min-w-0 flex-1 rounded-md bg-pill px-3 outline-none placeholder:text-dim focus:ring-2
            focus:ring-accent" />
        <Button disabled={!text.trim()} onClick={add}><Plus size={15} />Add</Button>
      </div>
    </Group>
  )
}
