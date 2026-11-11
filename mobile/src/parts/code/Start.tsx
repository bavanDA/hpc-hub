// Code with nothing open: this cluster's projects and folders (the desktop's start view), with any edits from earlier
// that were never saved above them.
import { FileWarning, Folder, FolderOpen, House } from 'lucide-react'
import { useEffect, useState } from 'react'

import { tilde } from '@shared/components/code/desktop/paths'
import { allDrafts, type Draft } from '@shared/components/code/drafts'
import type { Project } from '@shared/types/projects'
import { MainButton, Row, Section } from '../../ui'
import { nameOf } from './util'

export function Start({ home, projects, recent, onOpen, onBrowse, onFile }: {
  home: string; projects: Project[]; recent: string[]; onOpen: (path: string) => void; onBrowse: () => void
  onFile: (cluster: string, path: string) => void
}) {
  const [drafts, setDrafts] = useState<Draft[]>([])
  useEffect(() => { allDrafts().then(setDrafts).catch(() => {}) }, [])
  return (
    <div className="min-h-0 flex-1 overflow-y-auto pt-8 pb-10">
      <h2 className="px-5 text-xl font-semibold">Open a project</h2>
      {drafts.length > 0 && <Section title="Not saved">
        {drafts.map((d) => (
          <Row key={`${d.cluster}:${d.path}`} icon={FileWarning} label={nameOf(d.path)}
            sub={<span className="font-mono text-xs">{tilde(d.path, home)}</span>} onPress={() => onFile(d.cluster, d.path)} />
        ))}
      </Section>}
      {projects.length > 0 && <Section title="Projects">
        {projects.map((p) => (
          <Row key={p.id} icon={Folder} label={p.name} onPress={() => onOpen(p.path)}
            sub={<span className="font-mono text-xs">{tilde(p.path, home)}</span>} />
        ))}
      </Section>}
      <Section title="Folders">
        {home && <Row icon={House} label="Home folder" onPress={() => onOpen(home)} />}
        {recent.map((p) => (
          <Row key={p} icon={Folder} label={p.split('/').filter(Boolean).pop() ?? p}
            sub={<span className="font-mono text-xs">{tilde(p, home)}</span>} onPress={() => onOpen(p)} />
        ))}
      </Section>
      <div className="px-5 pt-6">
        <MainButton icon={FolderOpen} onClick={onBrowse}>Open folder</MainButton>
      </div>
    </div>
  )
}
