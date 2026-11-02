// Ask all: one prompt to every agent you pick, each writing its answer into one folder. The desktop's Ask all
// dialog as a phone sheet.
import { useEffect, useState } from 'react'

import { shortName } from '@shared/components/clusters/loginCopy'
import { answersFolder, sendable } from '@shared/components/tools/format'
import { startAsk } from '@shared/components/tools/run'
import { useGo } from '@shared/nav'
import { call } from '@shared/rpc'
import type { ToolSetup } from '@shared/types/tools'
import { Field, MainButton, Section, Sheet, TextArea, ToggleRow } from '../../ui'
import { FolderField } from './FolderField'
import { NodeRow } from './NodeFields'

export function AskAllSheet({ setup, folder: first = '', onClose }:
  { setup: ToolSetup; folder?: string; onClose: () => void }) {
  const go = useGo()
  const claude = setup.agents.find((a) => a.id === 'claude')
  const [folder, setFolderState] = useState(first || claude?.settings.workdir || '~')
  const [out, setOut] = useState(() => answersFolder(folder))
  const [auto, setAuto] = useState(out)  // the answers folder follows the folder until you change it
  const [prompt, setPrompt] = useState('')
  const [picked, setPicked] = useState<Record<string, boolean>>(
    () => Object.fromEntries(setup.agents.map((a) => [a.id, true])))
  const [found, setFound] = useState<string[] | null>(null)
  const [checkFailed, setCheckFailed] = useState(false)
  const [discuss, setDiscuss] = useState(false)
  const [profile, setProfile] = useState(setup.profile)
  const [remember, setRemember] = useState(true)
  const [note, setNote] = useState('')

  useEffect(() => {
    call<string[]>('tools.installed', { cluster: setup.id }).then(setFound).catch(() => setCheckFailed(true))
  }, [setup.id])

  const setFolder = (f: string) => {
    setFolderState(f)
    if (out === auto) { const next = answersFolder(f); setAuto(next); setOut(next) }
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

  const short = shortName({ name: setup.name })
  return (
    <Sheet title={`Ask all on ${short}`} flush onClose={onClose} actions={<MainButton onClick={ask}>Ask all</MainButton>}>
      <div className="px-4">
        {note && <p className="pb-1 font-semibold text-bad">{note}</p>}
        <TextArea label="Prompt" value={prompt} onChange={(e) => { setPrompt(e.target.value); setNote('') }}
          placeholder="Which of these two plotting scripts is easier to maintain, and why?" />
        <FolderField cluster={setup.id} name={setup.name} value={folder} onChange={setFolder} />
        <Field label="Answers go to" value={out} autoCapitalize="none" autoCorrect="off" spellCheck={false}
          onChange={(e) => setOut(e.target.value)} />
      </div>
      <Section title="Who answers" note={checkFailed ? "Couldn't check which agents are installed."
        : !found ? 'Checking which ones are installed…' : 'Each one works in the folder and writes its own answer.'}>
        {setup.agents.map((a) => (
          <ToggleRow key={a.id} label={a.name} checked={Boolean(picked[a.id]) && usable(a.id)}
            sub={usable(a.id) ? undefined : 'Not installed'}
            onChange={(on) => { if (usable(a.id)) { setPicked({ ...picked, [a.id]: on }); setNote('') } }} />
        ))}
        <ToggleRow label="Let them read each other's answers" checked={discuss} onChange={setDiscuss}
          sub="Each one answers again after reading the others" />
      </Section>
      <Section>
        {setup.node
          ? <NodeRow cluster={setup.id} node={setup.node} />
          : <>
              <NodeRow cluster={setup.id} label="Compute node" profile={profile} onChange={setProfile} />
              <ToggleRow label="Use this size next time" checked={remember} onChange={setRemember} />
            </>}
      </Section>
    </Sheet>
  )
}
