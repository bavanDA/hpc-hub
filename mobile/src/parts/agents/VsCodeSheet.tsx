// VS Code on a phone: the VS Code app can't run here, so it always opens in the browser (vscode.dev) through the
// tunnel VS Code's own job runs on a compute node. A running VS Code job is used unless you start a new one.
import { Globe } from 'lucide-react'
import { useState } from 'react'

import { sendable } from '@shared/components/tools/format'
import { startVscode } from '@shared/components/tools/run'
import { useGo } from '@shared/nav'
import type { ToolSetup, VsFound } from '@shared/types/tools'
import { Button, Card, Segments, Sheet, Switch } from '../../ui'
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
    <Sheet title={`VS Code on ${setup.name}`} onClose={onClose}
      actions={<Button kind="primary" icon={Globe} className="flex-1" onClick={open}>Open in the browser</Button>}>
      <p className="mb-3 text-dim">It opens at vscode.dev in your browser. The first time, sign in with GitHub
        when it asks.</p>
      {job && (
        <div className="mb-3">
          <p className="mb-2 font-semibold">{job.node ? `VS Code is already running on node ${job.node}`
            : 'A VS Code job is waiting in the queue'}</p>
          <Segments value={keep ? 'keep' : 'new'} onChange={(x) => setKeep(x === 'keep')}
            options={[['keep', 'Use it'], ['new', 'Start a new one']] as const} />
          {job.resources && <p className="mt-1 text-sm text-dim">{job.resources}</p>}
        </div>
      )}
      <FolderField cluster={setup.id} name={setup.name} value={folder} onChange={setFolder} />
      {!keep && (
        <div className="mt-2">
          <NodeRow line="VS Code runs as a job of its own" profile={profile} onChange={setProfile} />
          <Card className="mt-2 py-1"><Switch label="Use these next time" checked={remember} onChange={setRemember} /></Card>
        </div>
      )}
    </Sheet>
  )
}
