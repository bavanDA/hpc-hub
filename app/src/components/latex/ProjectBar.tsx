import { FolderOpen, PanelLeft, X } from 'lucide-react'
import type { ReactNode } from 'react'

type Props = {
  name: string
  where: string  // the cluster and the main file
  status: string  // Saving…, Not saved, Saved
  hidden: boolean
  showTree: boolean
  onTree: () => void
  views: ReactNode
  tools: ReactNode  // build and git, before Open
  onOpenIn: () => void
  onClose: () => void
}

export function ProjectBar({ name, where, status, hidden, showTree, onTree, views, tools, onOpenIn, onClose }: Props) {
  return (
    <div className={`flex h-12 shrink-0 items-center gap-2 border-b border-line bg-window px-2 ${hidden ? 'hidden' : ''}`}>
      <button onClick={onTree} aria-label="Show or hide the files" title="Show or hide the files"
        className={`grid size-8 place-items-center rounded-md ${showTree ? 'bg-selected' : 'hover:bg-hover'}`}>
        <PanelLeft size={16} /></button>
      <div className="min-w-0 flex-1 leading-tight">
        <div className="truncate text-base font-semibold">{name}</div>
        <div className="truncate text-xs text-dim">{where}
          <span className="ml-2">{status}</span></div>
      </div>
      {views}
      <div className="flex flex-1 items-center justify-end gap-1.5">
        {tools}
        <button onClick={onOpenIn} title="Open the folder in Code, VS Code, an agent and more"
          className="flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm font-semibold hover:bg-hover">
          <FolderOpen size={16} /> Open</button>
        <button onClick={onClose} aria-label="Close project"
          title="Close project" className="grid size-8 place-items-center rounded-md hover:bg-hover"><X size={16} /></button>
      </div>
    </div>
  )
}
