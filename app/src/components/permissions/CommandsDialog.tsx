import { useState } from 'react'

import type { CommandGroup } from '../../types/permissions'
import { EButton } from '../e/EButton'
import { EDialog } from '../e/EDialog'
import { Field } from '../e/Field'
import { List } from '../e/List'
import { MainButton } from '../e/MainButton'
import { ToggleRow } from '../e/ToggleRow'
import { useToast } from '../useToast'
import { GROUPS } from './groups'

export function CommandsDialog({ group, own, commands, allowed, known, onChange, onAdd, onClose }: {
  group: CommandGroup; own: boolean; commands: string[]; allowed: Set<string>; known: (cmd: string) => boolean
  onChange: (cmds: string[], on: boolean) => void; onAdd: (cmd: string) => void; onClose: () => void
}) {
  const toast = useToast()
  const [text, setText] = useState('')
  const add = () => {
    const cmd = text.trim().split(/\s+/)[0]
    setText('')
    if (!cmd) return
    if (cmd === 'rm') { toast("rm can't be allowed. Deleted files go to the trash instead"); return }
    if (known(cmd)) onChange([cmd], true)
    else onAdd(cmd)
  }
  const on = commands.filter((c) => allowed.has(c)).length
  return (
    <EDialog title={GROUPS[group.title] ?? group.title} width={480} onClose={onClose}
      actions={<MainButton onClick={onClose}>Done</MainButton>}>
      {own && (
        <form className="flex items-end gap-2 px-5" onSubmit={(e) => { e.preventDefault(); add() }}>
          <div className="min-w-0 flex-1"><Field label="Add a command" value={text} placeholder="conda or ./run.sh"
            onChange={(e) => setText(e.target.value)} /></div>
          <EButton type="submit" className="mb-1.5" disabled={!text.trim()}>Add</EButton>
        </form>
      )}
      {commands.length > 0 ? <>
        <div className={own ? 'pt-3' : ''}><List>
          <ToggleRow label="Allow all of them" checked={on === commands.length}
            onChange={(v) => onChange(commands, v)} />
        </List></div>
        {group.note && <p className="px-5 pt-2 text-sm text-dim">{group.note}</p>}
        <div className="pt-5"><List>
          {commands.map((c) => (
            <ToggleRow key={c} label={c} checked={allowed.has(c)} onChange={(v) => onChange([c], v)} />
          ))}
        </List></div>
      </> : <p className="px-5 pt-3 text-dim">None yet.</p>}
    </EDialog>
  )
}
