// Ask all: one prompt to every agent you pick, each writing its answer into one folder. The desktop's Ask all
// dialog as a phone sheet.
import { useEffect, useState } from 'react'

import { answersFolder, sendable } from '@shared/components/tools/format'
import { startAsk } from '@shared/components/tools/run'
import { useGo } from '@shared/nav'
import { call } from '@shared/rpc'
import type { ToolSetup } from '@shared/types/tools'
import { Button, Card, Field, Sheet, Switch, TextArea } from '../../ui'
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

  return (
    <Sheet title={`Ask all on ${setup.name}`} onClose={onClose}
      actions={<Button kind="primary" className="flex-1" onClick={ask}>Ask all</Button>}>
      {note && <p className="mb-3 rounded-xl bg-bad-bg p-3 text-bad">{note}</p>}
      <TextArea label="Prompt" value={prompt} onChange={(e) => { setPrompt(e.target.value); setNote('') }}
        placeholder="Which of these two plotting scripts is easier to maintain, and why?" />
      <FolderField cluster={setup.id} name={setup.name} value={folder} onChange={setFolder} />
      <Field label="Answers go to" value={out} autoCapitalize="none" autoCorrect="off" spellCheck={false}
        onChange={(e) => setOut(e.target.value)} />
      <h2 className="mt-3 mb-1 font-bold">Who answers</h2>
      <p className="mb-2 text-sm text-dim">{checkFailed ? "Couldn't check which agents are installed."
        : !found ? 'Checking which ones are installed…' : 'Each one works in the folder and writes its own answer.'}</p>
      <Card className="py-1">
        {setup.agents.map((a) => (
          <Switch key={a.id} label={a.name} checked={Boolean(picked[a.id]) && usable(a.id)}
            hint={usable(a.id) ? undefined : 'Not installed on this cluster'}
            onChange={(on) => { if (usable(a.id)) { setPicked({ ...picked, [a.id]: on }); setNote('') } }} />
        ))}
        <Switch label="Let them read each other's answers" checked={discuss} onChange={setDiscuss}
          hint="A second round where each one answers again after reading the others" />
      </Card>
      <div className="mt-3">
        {setup.node
          ? <NodeRow line={`Runs on your node ${setup.node}`} sub={`Job ${setup.job}, no new job needed`} />
          : <>
              <NodeRow line="Asks for a compute node first" profile={profile} onChange={setProfile} />
              <Card className="mt-2 py-1"><Switch label="Use this size next time" checked={remember}
                onChange={setRemember} /></Card>
            </>}
      </div>
    </Sheet>
  )
}
