import { FolderOpen } from 'lucide-react'
import { useState } from 'react'

import { useGo } from '../../nav'
import type { Target, ToolSetup, VsFound } from '../../types/tools'
import { shortName } from '../clusters/loginCopy'
import { NodeFields } from '../clusters/node/NodeFields'
import { EDialog } from '../e/EDialog'
import { Field } from '../e/Field'
import { MainButton } from '../e/MainButton'
import { Section } from '../e/Section'
import { Segments } from '../e/Segments'
import { ToggleRow } from '../e/ToggleRow'
import { FolderPicker } from '../projects/FolderPicker'
import { sendable } from './format'
import { startVscode } from './run'
import { ASK_VS, ASK_VS_SUB, inWords } from './vscodeWords'

const TARGETS = [['desktop', 'VS Code app'], ['browser', 'Browser']] as const
export function VsCodeDialog({ setup, found, folder: start = '', target: wanted, onClose, onBack }:
  { setup: ToolSetup; found: VsFound; folder?: string; target?: Target; onClose: () => void; onBack?: () => void }) {
  const go = useGo()
  const v = setup.vscode
  const job = found.job
  const [keep, setKeep] = useState(Boolean(job))
  const [folder, setFolder] = useState(start || v.workdir || '~')
  const [target, setTarget] = useState<Target>(wanted ?? v.open_in ?? 'desktop')
  const [profile, setProfile] = useState(v.profile)
  const [remember, setRemember] = useState(true)
  const [ask, setAsk] = useState(v.ask ?? true)
  const [picking, setPicking] = useState(false)
  const [fits, setFits] = useState(true)

  const open = () => {
    onClose()
    startVscode(setup.id, { folder: folder.trim() || '~', target, job: job?.id ?? '',
      replace_job: Boolean(job) && !keep, profile: keep ? null : sendable(profile), remember,
      remember_folder: !start, ask }, v.open_links, go)
  }

  return (
    <EDialog title={`VS Code on ${shortName(setup)}`} onClose={onClose} onBack={onBack}
      actions={<MainButton disabled={!keep && !fits} onClick={open}>{target === 'browser' ? 'Open in the browser' : 'Open in VS Code'}
      </MainButton>}>
      <div className="flex flex-col gap-3 px-5">
        {job && (
          <div>
            <p className="mb-2 font-medium">{job.node ? `VS Code is already running on node ${job.node}`
              : 'A VS Code job is waiting in the queue'}</p>
            <Segments label="VS Code" value={keep ? 'keep' : 'new'} onChange={(x) => setKeep(x === 'keep')}
              options={[['keep', 'Use it'], ['new', 'Start a new one']] as const} />
            {keep && job.resources && <p className="mt-1.5 text-sm text-dim">{inWords(job.resources)}</p>}
          </div>
        )}
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <Field label="Folder" value={folder === '~' ? '' : folder} placeholder="Home folder"
              onChange={(e) => setFolder(e.target.value || '~')} />
          </div>
          <button aria-label="Choose a folder" title="Choose a folder" onClick={() => setPicking(true)}
            className="mb-1.5 grid size-10 shrink-0 place-items-center rounded-lg border border-line-strong
              hover:bg-hover active:bg-pressed"><FolderOpen size={18} className="text-dim" /></button>
        </div>
        <div>
          <p className="mb-1.5 text-sm text-dim">Open in</p>
          <Segments label="Open in" value={target} onChange={setTarget} options={TARGETS} />
        </div>
      </div>
      {!keep && <section className="pt-5">
        <h3 className="px-5 pb-1 text-xs font-semibold tracking-wide text-dim uppercase">Compute node</h3>
        <p className="px-5 pb-2.5 text-sm text-dim">VS Code runs as a job of its own.</p>
        <NodeFields cluster={setup.id} value={profile} onChange={setProfile} onValid={setFits} />
        <ToggleRow label="Use these next time" checked={remember} onChange={setRemember} />
        <ToggleRow label={ASK_VS} sub={ASK_VS_SUB} checked={ask} onChange={setAsk} />
      </section>}
      {keep && <Section><ToggleRow label={ASK_VS} sub={ASK_VS_SUB} checked={ask} onChange={setAsk} /></Section>}
      {picking && <FolderPicker cluster={{ id: setup.id, name: setup.name, connected: true }}
        start={folder.trim() || '~'} onPick={setFolder} onClose={() => setPicking(false)} />}
    </EDialog>
  )
}
