// VS Code: a batch job of its own runs a tunnel on a compute node; the folder opens in the VS Code app or the
// browser (Tools.vscode in hpc_hub/ui/tools.py). A running VS Code job is used unless you switch it off. Style E,
// like the phone's VsCodeSheet. With Ask every time off, useTools starts it without this window.
import { FolderOpen } from 'lucide-react'
import { useState } from 'react'

import { useGo } from '../../nav'
import type { Target, ToolSetup, VsFound } from '../../types/tools'
import { shortName } from '../clusters/loginCopy'
import { human, minutes } from '../clusters/time'
import { NodeRow } from '../e/NodeFields'
import { EDialog, Field, MainButton, Section, Segments, ToggleRow } from '../e/ui'
import { memText } from '../jobs/format'
import { FolderPicker } from '../projects/FolderPicker'
import { sendable } from './format'
import { startVscode } from './run'

const TARGETS = [['desktop', 'VS Code app'], ['browser', 'Browser']] as const
export const ASK_VS = 'Ask every time'
export const ASK_VS_SUB = 'Shows this window before VS Code starts.'

/** "2 cores · 8G · 1:12:40 of 8:00:00" (squeue) in words: "2 cores · 8 GB · 1 h 13 min of 8 h". */
export function inWords(resources: string): string {
  const m = /^(\d+) cores · (\S+) · (\S+) of (\S+)$/.exec(resources)
  if (!m) return resources
  const time = (t: string) => { const n = minutes(t); return n === null ? t : human(n) }
  return `${m[1]} ${m[1] === '1' ? 'core' : 'cores'} · ${memText(m[2])} · ${time(m[3])} of ${time(m[4])}`
}

export function VsCodeDialog({ setup, found, folder: start = '', target: wanted, onClose }:
  { setup: ToolSetup; found: VsFound; folder?: string; target?: Target; onClose: () => void }) {
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

  const open = () => {
    onClose()
    startVscode(setup.id, { folder: folder.trim() || '~', target, job: job?.id ?? '',
      replace_job: Boolean(job) && !keep, profile: keep ? null : sendable(profile), remember,
      remember_folder: !start, ask }, v.open_links, go)
  }

  return (
    <EDialog title={`VS Code on ${shortName(setup)}`} onClose={onClose}
      actions={<MainButton onClick={open}>{target === 'browser' ? 'Open in the browser' : 'Open in VS Code'}
      </MainButton>}>
      <div className="flex flex-col gap-3 px-5">
        {job && (
          <div>
            <p className="mb-2 font-medium">{job.node ? `VS Code is already running on node ${job.node}`
              : 'A VS Code job is waiting in the queue'}</p>
            <Segments label="VS Code" value={keep ? 'keep' : 'new'} onChange={(x) => setKeep(x === 'keep')}
              options={[['keep', 'Use it'], ['new', 'Start a new one']] as const} />
            {job.resources && <p className="mt-1.5 text-sm text-dim">{inWords(job.resources)}</p>}
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
      <Section note={keep ? undefined : 'VS Code runs as a job of its own.'}>
        {!keep && <NodeRow cluster={setup.id} profile={profile} onChange={setProfile} />}
        {!keep && <ToggleRow label="Use these next time" checked={remember} onChange={setRemember} />}
        <ToggleRow label={ASK_VS} sub={ASK_VS_SUB} checked={ask} onChange={setAsk} />
      </Section>
      {picking && <FolderPicker cluster={{ id: setup.id, name: setup.name, connected: true }}
        start={folder.trim() || '~'} onPick={setFolder} onClose={() => setPicking(false)} />}
    </EDialog>
  )
}
