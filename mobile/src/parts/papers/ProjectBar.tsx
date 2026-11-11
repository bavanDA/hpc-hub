// The desktop's project bar on the phone: the files, the paper's name, Recompile with its menu, the three dots, and the
// view switch under them. Both, Git and Open live in the three dots; build settings and the log in Recompile's arrow.
import { BookOpenText, ChevronDown, Columns2, FileText, FolderOpen, GitBranch, History, MoreVertical, PanelLeft,
  RefreshCw, ScrollText, Settings2, SquareX } from 'lucide-react'

import { Spinner } from '@shared/components/ui/Spinner'
import { IconBtn, Menu, type MenuItem } from '../../ui'

export type View = 'editor' | 'split' | 'pdf' | 'reader' | 'history'
const VIEWS = [['editor', 'Editor', FileText], ['pdf', 'PDF', ScrollText], ['reader', 'Reader', BookOpenText],
  ['history', 'History', History]] as const

type Props = {
  name: string
  where: string  // the cluster and the main file
  status: string  // Saving, Not saved, Saved
  view: View
  onView: (v: View) => void
  running: boolean
  onBuild: () => void
  onFiles: () => void
  onBuildSettings: () => void
  onLogs: () => void
  logCount: number
  onGit: () => void
  onOpen: () => void
  onClose: () => void
}

export function ProjectBar({ name, where, status, view, onView, running, onBuild, onFiles, onBuildSettings, onLogs,
  logCount, onGit, onOpen, onClose }: Props) {
  const more: MenuItem[][] = [
    [{ label: 'Both', icon: Columns2, onClick: () => onView('split') },
      { label: 'Git', icon: GitBranch, onClick: onGit },
      { label: 'Open', icon: FolderOpen, onClick: onOpen }],
    [{ label: 'Close project', icon: SquareX, onClick: onClose }],
  ]
  const buildMenu: MenuItem[][] = [[
    { label: 'Build settings', icon: Settings2, onClick: onBuildSettings },
    { label: logCount ? `Logs and issues · ${logCount}` : 'Logs and issues', icon: ScrollText, onClick: onLogs },
  ]]
  return (
    <div className="flex shrink-0 flex-col gap-1.5 border-b border-line bg-window px-2 pt-1.5 pb-2">
      <div className="flex items-center gap-2">
        <IconBtn icon={PanelLeft} label="Show or hide the files" small onClick={onFiles} />
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate font-semibold">{name}</div>
          <div className="truncate text-xs text-dim">{where} <span className="ml-2">{status}</span></div>
        </div>
        <div className="flex shrink-0">
          <button onClick={onBuild} disabled={running} title="Save and build"
            className="flex h-8 items-center gap-1.5 rounded-l-md bg-accent px-3 text-sm font-semibold text-on-accent
              active:bg-accent-pressed disabled:opacity-60">
            {running ? <Spinner size={14} /> : <RefreshCw size={14} />} {running ? 'Compiling' : 'Recompile'}</button>
          <Menu label="Build settings and logs" trigger={<ChevronDown size={14} />} groups={buildMenu}
            className="grid h-8 w-7 place-items-center rounded-r-md border-l border-on-accent/25 bg-accent text-on-accent
              active:bg-accent-pressed" />
        </div>
        <Menu label="More" trigger={<MoreVertical size={16} />} groups={more}
          className="grid size-9 shrink-0 place-items-center rounded-md text-dim active:bg-pressed" />
      </div>
      <div role="radiogroup" aria-label="Show" className="flex gap-[3px] rounded-lg border border-line-strong p-[3px]">
        {VIEWS.map(([v, label, I]) => (
          <button key={v} role="radio" aria-checked={view === v} onClick={() => onView(v)}
            className={`flex h-7 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md text-sm ${view === v
              ? 'bg-accent font-semibold text-on-accent' : 'text-dim active:bg-pressed'}`}>
            <I size={14} className="shrink-0" /> {label}</button>
        ))}
      </div>
    </div>
  )
}
