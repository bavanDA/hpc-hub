// The bar over the open file, the desktop's: its path, Reload, Find, Ask and Save (with Follow for a log, Submit job
// for a Slurm script). Tapping the path shows what a right click and the menus do on a desktop. A file opens in view
// mode, so scrolling never brings up the keyboard: Edit, in Save's place, starts typing.
import { Clock, Pencil, Play, RefreshCw, Save, Search, Send } from 'lucide-react'

import { isDirty, type OpenFile } from '@shared/components/code/store'
import { Button } from '@shared/components/ui/Button'
import { IconButton } from '@shared/components/ui/IconButton'
import { Menu, type MenuItem } from '../../ui'

export function FileBar({ file, slurm, following, asking, badge, canEdit, menu, log, onReload, onFind, onAsk, onSave,
  onEdit, onSubmit, onFollow }: {
  file: OpenFile; slurm: boolean; following: boolean; asking: boolean; badge: number; canEdit: boolean
  menu: MenuItem[][]; log: boolean; onReload: () => void; onFind: () => void; onAsk: () => void; onSave: () => void
  onEdit: () => void; onSubmit: () => void; onFollow: () => void
}) {
  const dirty = isDirty(file)
  return (
    <div className="flex h-10 shrink-0 items-center gap-0.5 border-b border-line px-2">
      <Menu label={`${file.path}, more`} groups={menu}
        trigger={<span className="block truncate font-mono text-xs text-dim">{file.path}</span>}
        className="flex h-full min-w-0 flex-1 items-center text-left pr-1" />
      {slurm && file.writable && <Button size="sm" kind="ghost" onClick={onSubmit}><Send size={14} />Submit job</Button>}
      {log && (
        <Button size="sm" kind={following ? 'secondary' : 'ghost'} onClick={onFollow}>
          {following ? <Clock size={14} /> : <Play size={14} />}{following ? 'Following' : 'Follow'}</Button>
      )}
      <IconButton icon={RefreshCw} label="Reload" size={14} className="!size-8" onClick={onReload} />
      {!log && <IconButton icon={Search} label="Find" size={14} className="!size-8" onClick={onFind} />}
      <button type="button" onClick={onAsk} aria-pressed={asking} aria-label="Ask an agent about this file"
        className={`relative flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm font-semibold
          ${asking ? 'bg-selected' : 'active:bg-pressed'}`}>
        Ask{badge > 0 && <span className="grid min-w-4 place-items-center rounded-full bg-accent px-1 text-[11px]
          text-white">{badge}</span>}
      </button>
      {!canEdit || file.editing
        ? <Button size="sm" kind={dirty ? 'primary' : 'ghost'} disabled={!dirty || !file.writable} onClick={onSave}>
            <Save size={14} /> Save</Button>
        : <Button size="sm" kind="ghost" onClick={onEdit}><Pencil size={14} /> Edit</Button>}
    </div>
  )
}
