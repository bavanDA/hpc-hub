// VS Code: a batch job of its own runs a tunnel on a compute node; the folder opens in the VS Code app or the
// browser (Tools.vscode in hpc_hub/ui/tools.py). A running VS Code job is used unless you switch it off.
import { useState } from 'react'

import { useGo } from '../../nav'
import type { Target, ToolSetup, VsFound } from '../../types/tools'
import { Group, SwitchRow } from '../clusters/fields'
import { Button, Dialog } from '../ui'
import { ComputeGroup, FolderRow, SelectRow } from './fields'
import { sendable } from './format'
import { startVscode } from './run'

const TARGETS: [Target, string][] = [['desktop', 'VS Code app'], ['browser', 'Browser (vscode.dev)']]

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

  const open = () => {
    onClose()
    startVscode(setup.id, { folder: folder.trim() || '~', target, job: job?.id ?? '',
      replace_job: Boolean(job) && !keep, profile: keep ? null : sendable(profile), remember,
      remember_folder: !start }, v.open_links, go)
  }

  const stopNote = 'Off: stop it and start one with the settings below'
  return (
    <Dialog title={`VS Code on ${setup.name}`} onClose={onClose} width={600}
      actions={<>
        <Button onClick={onClose}>Cancel</Button>
        <Button kind="suggested" onClick={open}>Open</Button>
      </>}>
      <Group title="VS Code">
        {job && <SwitchRow label={`Use the running VS Code job (${job.node || 'waiting in the queue'})`}
          sub={job.resources ? `${job.resources}. ${stopNote}` : stopNote} checked={keep} onChange={setKeep} />}
        <FolderRow cluster={setup} value={folder} onChange={setFolder} />
        <SelectRow label="Open in" value={target} choices={TARGETS} onChange={(t) => setTarget(t as Target)} />
      </Group>
      {!keep && <ComputeGroup cluster={setup.id} value={profile} onChange={setProfile}
        description="VS Code runs as a batch job of its own, with:" />}
      <Group><SwitchRow label="Use these next time" checked={remember} onChange={setRemember} /></Group>
    </Dialog>
  )
}
