// Start Claude, ChatGPT, Antigravity or Cursor on a cluster: the desktop's window. An optional task, the folder,
// where it runs, the agent's own options as dropdowns, and the chats you can continue.
import { useEffect, useState } from 'react'

import { agentIcon } from '@shared/components/agents/AgentIcon'
import { shortName } from '@shared/components/clusters/loginCopy'
import { useClusters } from '@shared/components/clusters/store'
import { SelectField } from '@shared/components/e/SelectField'
import { basename } from '@shared/components/files/format'
import { chatPlace, sendable, when } from '@shared/components/tools/format'
import { startAgent } from '@shared/components/tools/run'
import { Spinner } from '@shared/components/ui/Spinner'
import { useGo } from '@shared/nav'
import { call } from '@shared/rpc'
import type { AgentInfo, Chats, ToolSetup } from '@shared/types/tools'
import { Dialog, MainButton, Row, SearchField, Section, TextArea, ToggleRow } from '../../ui'
import { NodeFields } from '../NodeSheet'
import { FolderField } from './FolderField'

export function AgentSheet({ setup, agent: a, project = '', onClose }:
  { setup: ToolSetup; agent: AgentInfo; project?: string; onClose: () => void }) {
  const go = useGo()
  const { clusters } = useClusters()
  const cluster = clusters?.find((c) => c.id === setup.id)
  const s = a.settings
  const [task, setTask] = useState('')
  const [folder, setFolder] = useState(project || s.workdir || '~')
  const [remote, setRemote] = useState(s.remote)
  const [newNode, setNewNode] = useState(s.new_node)
  const [profile, setProfile] = useState(a.profile)
  const [fits, setFits] = useState(true)
  const [options, setOptions] = useState<Record<string, string>>(
    () => Object.fromEntries(a.options.map((o) => [o.key, String(s[o.key] ?? '')])))
  const [chats, setChats] = useState<Chats | null>(null)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')

  useEffect(() => {
    // the last list at once (reading chats can take seconds on a cold cluster), then the fresh one
    let fresh = false
    const where = { cluster: setup.id, agent: a.id, folder: project }
    call<Chats | null>('tools.chats_cached', where).then((c) => { if (c && !fresh) setChats(c) }).catch(() => {})
    call<Chats>('tools.chats', where)
      .then((c) => { fresh = true; setChats(c) })
      .catch((e: Error) => { fresh = true; setError(e.message) })
  }, [setup.id, a.id, project])

  const asks = newNode || !setup.node
  const run = (where: string, chatId: string, label = '') => {
    onClose()
    startAgent(setup.id, { agent: a.id, name: a.name, folder: where, chat_id: chatId, label, task: task.trim(),
      options, new_node: newNode, remote_control: remote, profile: asks ? sendable(profile) : null }, go)
  }

  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  const list = chats?.chats ?? []
  const shown = list.filter((c) => words.every((w) => `${c.name} ${c.first} ${c.last} ${c.cwd}`.toLowerCase()
    .includes(w)))
  const where = project ? `in ${basename(project)}` : `on ${shortName(setup)}`
  const status = error ? `Could not read chats: ${error}` : !chats ? 'Loading your chats'
    : list.length ? (chats.cached ? 'Checking for newer ones' : '')
      : project ? 'No chats here yet.' : 'No chats yet.'

  return (
    <Dialog title={`${a.name} ${where}`} icon={agentIcon(a.id)} width={560} onClose={onClose}
      actions={<MainButton disabled={asks && !fits} onClick={() => run(folder.trim() || '~', '')}>Start</MainButton>}>
      <div className="px-5">
        <TextArea label="Task (optional)" value={task} rows={3} onChange={(e) => setTask(e.target.value)}
          placeholder="Fix the failing test in train.py" />
        <FolderField cluster={setup.id} name={setup.name} value={folder} onChange={setFolder} />
      </div>
      <Section>
        <ToggleRow label="Use a new compute node" checked={newNode} onChange={setNewNode}
          sub={newNode ? 'A node just for this agent' : setup.node ? `Shares ${setup.node} with your terminals`
            : 'Gets a node when it starts'} />
        {a.remote_label && <ToggleRow label={a.remote_label} sub={a.remote_hint} checked={remote} onChange={setRemote} />}
        {a.options.map((o) => (
          <div key={o.key} className="border-b border-line px-5 pb-2">
            <SelectField label={o.label} value={options[o.key] ?? ''} options={o.choices}
              onChange={(v) => setOptions({ ...options, [o.key]: v })} />
          </div>
        ))}
      </Section>
      {asks && cluster && <section className="pt-5">
        <h3 className="px-5 pb-1 text-xs font-semibold tracking-wide text-dim uppercase">
          {newNode ? 'New compute node' : 'Compute node'}</h3>
        <p className="px-5 pb-2.5 text-sm text-dim">{newNode ? 'Asked for when the agent starts.'
          : 'You have no node yet, so it asks for one.'}</p>
        <NodeFields cluster={cluster} value={profile} onChange={setProfile} onValid={setFits} now />
      </section>}
      <Section title={project ? 'Or continue a chat here' : 'Or continue a chat'} note={status || undefined}>
        {list.length > 6 && <div className="border-b border-line px-5 py-2">
          <SearchField value={query} onChange={setQuery} placeholder="Search chats" /></div>}
        {!chats && !error && <div className="grid place-items-center border-b border-line py-5"><Spinner /></div>}
        {shown.map((c) => (
          <Row key={c.id} label={c.name} onPress={() => run(c.cwd || '~', c.id, c.name.slice(0, 40))}
            sub={[when(c.mtime), chatPlace(c.cwd, folder, chats?.home ?? '')].filter(Boolean).join(' · ')} />
        ))}
      </Section>
    </Dialog>
  )
}
