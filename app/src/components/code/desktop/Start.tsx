import { Folder, FolderOpen, House } from 'lucide-react'

import type { Project } from '../../../types/projects'
import { MainButton } from '../../e/MainButton'
import { Row } from '../../e/Row'
import { Section } from '../../e/Section'
import { tilde } from './paths'

/** The Code page with no folder open: this cluster's projects and the folders opened before. */
export function Start({ home, projects, recent, onOpen, onBrowse }: {
  home: string; projects: Project[]; recent: string[]; onOpen: (path: string) => void; onBrowse: () => void
}) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-[560px] flex-col px-4 py-12">
        <h2 className="px-5 text-xl font-semibold">Open a project</h2>
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
    </div>
  )
}
