// VS Code on a phone: the VS Code app can't run here, so it always opens in the browser (vscode.dev) through the
// tunnel VS Code's own job runs on a compute node. A running VS Code job is used unless you start a new one.
import { Globe } from 'lucide-react'
import { useState } from 'react'

import { shortName } from '@shared/components/clusters/loginCopy'
import { sendable } from '@shared/components/tools/format'
import { inWords } from '@shared/components/tools/vscodeWords'
import { startVscode } from '@shared/components/tools/run'
import type { ToolSetup, VsFound } from '@shared/types/tools'
import { MainButton, Section, Segments, Sheet, ToggleRow } from '../../ui'
import { FolderField } from './FolderField'
import { useClusters } from '@shared/components/clusters/store'
import { NodeFields } from '../NodeSheet'
import { useToast } from '../../ui'

export function VsCodeSheet({ setup, found, folder: first = '', onClose }:
  { setup: ToolSetup; found: VsFound; folder?: string; onClose: () => void }) {
  const toast = useToast()
  const v = setup.vscode
  const job = found.job
  const [keep, setKeep] = useState(Boolean(job))
  const [folder, setFolder] = useState(first || v.workdir || '~')
  const [profile, setProfile] = useState(v.profile)
  const [remember, setRemember] = useState(true)
  const [ask, setAsk] = useState(v.ask ?? true)
  const [fits, setFits] = useState(true)
  const cluster = useClusters().clusters?.find((c) => c.id === setup.id)

  const open = () => {
    onClose()
    // links (the tunnel, a GitHub sign-in, VS Code web on a forwarded port) open in the browser as they show up
    startVscode(setup.id, setup.name, { folder: folder.trim() || '~', target: 'browser', job: job?.id ?? '',
      replace_job: Boolean(job) && !keep, profile: keep ? null : sendable(profile), remember,
      remember_folder: !first, ask }, true)
      .catch((e: Error) => toast(`VS Code didn't start: ${e.message}`, { kind: 'error' }))
  }

  return (
    <Sheet title={`VS Code on ${shortName({ name: setup.name })}`} flush onClose={onClose}
      actions={<MainButton icon={Globe} disabled={!keep && !fits} onClick={open}>Open in the browser</MainButton>}>
      <div className="px-4">
        <p className="pb-2 text-dim">It opens at vscode.dev in your browser. The first time, sign in with GitHub
          when it asks.</p>
        {job && (
          <div className="py-2">
            <p className="mb-2 font-medium">{job.node ? `VS Code is already running on node ${job.node}`
              : 'A VS Code job is waiting in the queue'}</p>
            <Segments label="VS Code" value={keep ? 'keep' : 'new'} onChange={(x) => setKeep(x === 'keep')}
              options={[['keep', 'Use it'], ['new', 'Start a new one']] as const} />
            {keep && job.resources && <p className="mt-1.5 text-sm text-dim">{inWords(job.resources)}</p>}
          </div>
        )}
        <FolderField cluster={setup.id} name={setup.name} value={folder} onChange={setFolder} />
      </div>
      {!keep && cluster && <section className="pt-5">
        <h3 className="px-4 pb-1 text-xs font-semibold tracking-wide text-dim uppercase">Compute node</h3>
        <p className="px-4 pb-3 text-sm text-dim">VS Code runs as a job of its own.</p>
        <NodeFields cluster={cluster} value={profile} onChange={setProfile} onValid={setFits} />
      </section>}
      <Section>
        {!keep && <ToggleRow label="Use these next time" checked={remember} onChange={setRemember} />}
        <ToggleRow label="Ask every time" sub="Shows this screen before VS Code starts." checked={ask}
          onChange={setAsk} />
      </Section>
    </Sheet>
  )
}
