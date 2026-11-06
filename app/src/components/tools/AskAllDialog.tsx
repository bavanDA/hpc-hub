import { useEffect, useState } from 'react'

import { useGo } from '../../nav'
import { call } from '../../rpc'
import type { ToolSetup } from '../../types/tools'
import { agentIcon } from '../agents/AgentIcon'
import { shortName } from '../clusters/loginCopy'
import { IconToggleRow, TextArea } from '../e/extra'
import { NodeFields } from '../clusters/node/NodeFields'
import { EDialog, Field, List, MainButton, Row, Section, ToggleRow } from '../e/ui'
import { FolderField } from './fields'
import { answersFolder, sendable } from './format'
import { startAsk } from './run'

export function AskAllDialog({ setup, folder: start = '', onClose, onBack }:
  { setup: ToolSetup; folder?: string; onClose: () => void; onBack?: () => void }) {
  const go = useGo()
  const claude = setup.agents.find((a) => a.id === 'claude')
  const [folder, setFolderState] = useState(start || claude?.settings.workdir || '~')
  const [out, setOut] = useState('')  // empty: a new folder for this ask inside the folder (answersFolder)
  const [prompt, setPrompt] = useState('')
  const [picked, setPicked] = useState<Record<string, boolean>>(
    () => Object.fromEntries(setup.agents.map((a) => [a.id, true])))
  const [found, setFound] = useState<string[] | null>(null)
  const [checkError, setCheckError] = useState(false)
  const [discuss, setDiscuss] = useState(false)
  const [profile, setProfile] = useState(setup.profile)
  const [fits, setFits] = useState(true)
  const [remember, setRemember] = useState(true)
  const [note, setNote] = useState('')

  useEffect(() => {
    call<string[]>('tools.installed', { cluster: setup.id }).then(setFound).catch(() => setCheckError(true))
  }, [setup.id])

  const setFolder = setFolderState
  const usable = (id: string) => !found || found.includes(id)
  const chosen = setup.agents.filter((a) => picked[a.id] && usable(a.id)).map((a) => a.id)

  const ask = () => {
    if (!prompt.trim()) { setNote('Write a prompt first'); return }
    if (!chosen.length) { setNote('Pick at least one agent'); return }
    const where = folder.trim() || '~'
    onClose()
    startAsk(setup.id, { folder: where, out: out.trim() || answersFolder(where), prompt, agents: chosen, discuss,
      profile: setup.node ? null : sendable(profile), remember }, go)
  }

  return (
    <EDialog title={`Ask all on ${shortName(setup)}`} width={560} onClose={onClose} onBack={onBack}
      actions={<MainButton disabled={!setup.node && !fits} onClick={ask}>Ask all</MainButton>}>
      <div className="px-5">
        {note && <p className="pb-1 font-semibold text-bad">{note}</p>}
        <TextArea label="Prompt" value={prompt} rows={5} autoFocus
          onChange={(e) => { setPrompt(e.target.value); setNote('') }}
          placeholder="Which of these two plotting scripts is easier to maintain, and why?" />
        <FolderField cluster={setup} value={folder} onChange={setFolder} />
        <Field label="Answers go to" value={out} placeholder="A new folder inside the one above"
          onChange={(e) => setOut(e.target.value)} />
      </div>
      <Section title="Who answers" note={checkError ? 'Could not check which agents are installed.'
        : !found ? 'Checking which ones are installed' : undefined}>
        {setup.agents.map((a) => (
          <IconToggleRow key={a.id} icon={agentIcon(a.id)} label={a.name} disabled={!usable(a.id)}
            checked={Boolean(picked[a.id]) && usable(a.id)} sub={usable(a.id) ? undefined : 'Not installed'}
            onChange={(on) => { if (usable(a.id)) { setPicked({ ...picked, [a.id]: on }); setNote('') } }} />
        ))}
        <ToggleRow label="Let them read each other's answers" checked={discuss} onChange={setDiscuss}
          sub="Each one answers again after reading the others" />
      </Section>
      {setup.node
        ? <div className="pt-5"><List><Row label="Compute node" value={setup.node} /></List></div>
        : <>
            <section className="pt-5">
              <h3 className="px-5 pb-1 text-xs font-semibold tracking-wide text-dim uppercase">Compute node</h3>
              <p className="px-5 pb-2.5 text-sm text-dim">You have no node yet, so it asks for one.</p>
              <NodeFields cluster={setup.id} value={profile} onChange={setProfile} onValid={setFits} />
            </section>
            <Section><ToggleRow label="Use this size next time" checked={remember} onChange={setRemember} /></Section>
          </>}
    </EDialog>
  )
}
