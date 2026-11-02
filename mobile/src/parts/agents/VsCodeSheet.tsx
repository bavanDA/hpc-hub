// VS Code on a phone: the VS Code app can't run here, so it always opens in the browser (vscode.dev) through the
// tunnel VS Code's own job runs on a compute node. A running VS Code job is used unless you start a new one.
import { Globe } from 'lucide-react'
import { useState } from 'react'

import { shortName } from '@shared/components/clusters/loginCopy'
import { sendable } from '@shared/components/tools/format'
import { startVscode } from '@shared/components/tools/run'
import { useGo } from '@shared/nav'
import type { ToolSetup, VsFound } from '@shared/types/tools'
import { MainButton, Section, Segments, Sheet, ToggleRow } from '../../ui'
import { FolderField } from './FolderField'
import { NodeRow } from './NodeFields'

export function VsCodeSheet({ setup, found, folder: first = '', onClose }:
  { setup: ToolSetup; found: VsFound; folder?: string; onClose: () => void }) {
  const go = useGo()
  const v = setup.vscode
  const job = found.job
  const [keep, setKeep] = useState(Boolean(job))
  const [folder, setFolder] = useState(first || v.workdir || '~')
  const [profile, setProfile] = useState(v.profile)
  const [remember, setRemember] = useState(true)

  const open = () => {
    onClose()
    // links (the tunnel, a GitHub sign-in, VS Code web on a forwarded port) open in the browser as they show up
    startVscode(setup.id, { folder: folder.trim() || '~', target: 'browser', job: job?.id ?? '',
      replace_job: Boolean(job) && !keep, profile: keep ? null : sendable(profile), remember,
      remember_folder: !first }, true, go)
  }

  return (
    <Sheet title={`VS Code on ${shortName({ name: setup.name })}`} flush onClose={onClose}
      actions={<MainButton icon={Globe} onClick={open}>Open in the browser</MainButton>}>
      <div className="px-4">
        <p className="pb-2 text-dim">It opens at vscode.dev in your browser. The first time, sign in with GitHub
          when it asks.</p>
        {job && (
          <div className="py-2">
            <p className="mb-2 font-medium">{job.node ? `VS Code is already running on node ${job.node}`
              : 'A VS Code job is waiting in the queue'}</p>
            <Segments label="VS Code" value={keep ? 'keep' : 'new'} onChange={(x) => setKeep(x === 'keep')}
              options={[['keep', 'Use it'], ['new', 'Start a new one']] as const} />
            {job.resources && <p className="mt-1.5 text-sm text-dim">{job.resources}</p>}
          </div>
        )}
        <FolderField cluster={setup.id} name={setup.name} value={folder} onChange={setFolder} />
      </div>
      {!keep && (
        <Section note="VS Code runs as a job of its own.">
          <NodeRow cluster={setup.id} label="Compute node" profile={profile} onChange={setProfile} />
          <ToggleRow label="Use these next time" checked={remember} onChange={setRemember} />
        </Section>
      )}
    </Sheet>
  )
}
