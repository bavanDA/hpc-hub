import { ArrowDown, ArrowUp, GitBranch, GitCommitHorizontal, History } from 'lucide-react'
import { useState } from 'react'

import { MenuButton } from '../ui/MenuButton'
import { Popover } from '../ui/Popover'
import { GitDialog } from './GitDialog'
import type { Where } from './where'

/** Push, Get the latest and the timeline run in the History tab, which always pulls first. */
type SafeGit = { push: () => void; pull: () => void; timeline: () => void }

export function GitMenu({ where, before, onPulled, safe }: { where: Where; before: () => Promise<boolean>;
  onPulled: () => void; safe: SafeGit }) {
  const [dialog, setDialog] = useState(false)
  return (
    <>
      <Popover width={300} button={(open, toggle) => (
        <button onClick={toggle} title="Pull, push, commit and history"
          className={`flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm font-semibold ${open ? 'bg-selected' : 'hover:bg-hover'}`}>
          <GitBranch size={16} /> Git</button>
      )}>
        {(close) => <>
          <MenuButton icon={<ArrowDown size={16} />} label="Get the latest" hint="from the remote"
            onClick={() => { close(); safe.pull() }} />
          <MenuButton icon={<ArrowUp size={16} />} label="Push" hint="pulls first"
            onClick={() => { close(); safe.push() }} />
          <MenuButton icon={<History size={16} />} label="Timeline" hint="compare any two"
            onClick={() => { close(); safe.timeline() }} />
          <div className="my-1 border-t border-line" />
          <MenuButton icon={<GitCommitHorizontal size={16} />} label="Commit, history and remote…"
            onClick={() => { close(); setDialog(true) }} />
        </>}
      </Popover>
      {dialog && <GitDialog where={where} before={before} onClose={() => setDialog(false)} onPulled={onPulled} />}
    </>
  )
}
