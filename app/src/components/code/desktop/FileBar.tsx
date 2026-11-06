import { Clock, Play, RefreshCw, Save, Search, Send, Sparkles } from 'lucide-react'

import { Button } from '../../ui/Button'
import { IconButton } from '../../ui/IconButton'
import { isDirty, type OpenFile } from '../store'
import { MOD } from './mod'
import { isLog, linesLabel } from './text'

/** The bar over the open file: its path and what you can do with it. */
export function FileBar({ file, selection, slurm, following, asking, badge, onExplain, onSubmit, onFollow, onReload,
  onFind, onAsk, onSave }: {
  file: OpenFile; selection: { from: number; to: number; count: number }; slurm: boolean; following: boolean
  asking: boolean; badge: number; onExplain: () => void; onSubmit: () => void; onFollow: () => void
  onReload: () => void; onFind: () => void; onAsk: () => void; onSave: () => void
}) {
  return (
    <div className="flex h-10 shrink-0 items-center gap-1 border-b border-line px-2">
      <span className="min-w-0 flex-1 truncate px-1 font-mono text-xs text-dim" title={file.path}>{file.path}</span>
      {selection.count > 0 && (
        <Button size="sm" kind="ghost" onClick={onExplain}>
          <Sparkles size={14} /> Explain lines {linesLabel(selection.from, selection.to)}
        </Button>
      )}
      {slurm && file.writable && (
        <Button size="sm" kind="ghost" onClick={onSubmit}><Send size={14} /> Submit job</Button>
      )}
      {isLog(file.path) && (
        <Button size="sm" kind={following ? 'secondary' : 'ghost'} onClick={onFollow}>
          {following ? <Clock size={14} /> : <Play size={14} />}
          {following ? 'Following' : 'Follow'}</Button>
      )}
      <IconButton icon={RefreshCw} label="Reload from the cluster" small onClick={onReload} />
      <IconButton icon={Search} label={`Find (${MOD}F)`} small onClick={onFind} />
      <button type="button" onClick={onAsk} aria-pressed={asking} title="Ask an agent about this file"
        className={`relative flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm font-semibold transition-colors
          duration-90 ${asking ? 'bg-selected' : 'hover:bg-hover'}`}>
        Ask
        {badge > 0 && (
          <span className="grid min-w-4 place-items-center rounded-full bg-accent px-1 text-[11px] text-white">
            {badge}</span>
        )}
      </button>
      <Button size="sm" kind={isDirty(file) ? 'primary' : 'ghost'} disabled={!isDirty(file) || !file.writable}
        onClick={onSave} title={`Save (${MOD}S)`}><Save size={14} /> Save</Button>
    </div>
  )
}
