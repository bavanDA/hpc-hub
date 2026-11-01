// Ask all: one prompt to every agent you pick; answers land in one folder (hpc_hub/agents/ui/ask_all.py).
import { useEffect, useState } from 'react'

import { useGo } from '../../nav'
import { call } from '../../rpc'
import type { ToolSetup } from '../../types/tools'
import { EntryRow, Group, SwitchRow } from '../clusters/fields'
import { Button, Dialog } from '../ui'
import { ComputeGroup, FolderRow, Section, TextBox } from './fields'
import { answersFolder, sendable } from './format'
import { startAsk } from './run'

export function AskAllDialog({ setup, folder: start = '', onClose }:
  { setup: ToolSetup; folder?: string; onClose: () => void }) {
  const go = useGo()
  const claude = setup.agents.find((a) => a.id === 'claude')
  const [folder, setFolderState] = useState(start || claude?.settings.workdir || '~')
  const [out, setOut] = useState(() => answersFolder(folder))
  const [auto, setAuto] = useState(out)  // the answers folder follows the folder until you edit it
  const [prompt, setPrompt] = useState('')
  const [picked, setPicked] = useState<Record<string, boolean>>(
    () => Object.fromEntries(setup.agents.map((a) => [a.id, true])))
  const [found, setFound] = useState<string[] | null>(null)
  const [checkError, setCheckError] = useState(false)
  const [discuss, setDiscuss] = useState(false)
  const [profile, setProfile] = useState(setup.profile)
  const [remember, setRemember] = useState(true)
  const [note, setNote] = useState('')

  useEffect(() => {
    call<string[]>('tools.installed', { cluster: setup.id }).then(setFound).catch(() => setCheckError(true))
  }, [setup.id])

  const setFolder = (f: string) => {
    setFolderState(f)
    if (out === auto) {
      const next = answersFolder(f)
      setAuto(next)
      setOut(next)
    }
  }
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

  const whoNote = checkError ? 'Could not check which agents are installed.' : !found
    ? 'Checking which ones are installed…'
    : 'Pick who answers. If an agent cannot write its file, what it printed is saved as its answer.'
  return (
    <Dialog title={`Ask all on ${setup.name}`} onClose={onClose} width={620}
      actions={<>
        {note && <span className="mr-auto self-center text-sm text-bad">{note}</span>}
        <Button onClick={onClose}>Cancel</Button>
        <Button kind="suggested" onClick={ask}>Ask all</Button>
      </>}>
      <Group description="Every agent you pick gets the same prompt and works in this folder. Each one writes its answer
        to the answers folder.">
        <FolderRow cluster={setup} value={folder} onChange={setFolder} />
        <EntryRow label="Answers folder" value={out} onChange={setOut} />
      </Group>
      <Section title="Prompt">
        <TextBox value={prompt} onChange={(v) => { setPrompt(v); setNote('') }} rows={6} autoFocus
          placeholder="Which of these two plotting scripts is easier to maintain, and why?" />
      </Section>
      <Group title="Agents" description={whoNote}>
        {setup.agents.map((a) => (
          <SwitchRow key={a.id} label={a.name} checked={Boolean(picked[a.id]) && usable(a.id)}
            sub={usable(a.id) ? undefined : `not installed ('${a.settings.command || a.id}' not found)`}
            onChange={(on) => { if (usable(a.id)) { setPicked({ ...picked, [a.id]: on }); setNote('') } }} />
        ))}
        <SwitchRow label="Let them read each other's answers" checked={discuss} onChange={setDiscuss}
          sub="Round 2: each reads the others' answers and writes a second one, like claude.round2.md" />
      </Group>
      {setup.node ? (
        <p className="mb-4 text-sm text-dim">Runs on your node {setup.node} (job {setup.job}).</p>
      ) : (
        <>
          <ComputeGroup cluster={setup.id} value={profile} onChange={setProfile}
            description="You have no node yet, so it asks for one with:" />
          <Group><SwitchRow label="Use these next time" checked={remember} onChange={setRemember} /></Group>
        </>
      )}
    </Dialog>
  )
}
