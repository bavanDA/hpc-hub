// Claude, ChatGPT, Antigravity or Cursor: pick a past chat to resume, or start a new one in a folder
// (hpc_hub/agents/ui/agent_dialog.py).
import { ChevronDown, ChevronRight, Cpu, Search } from 'lucide-react'
import { useEffect, useState } from 'react'

import { useGo } from '../../nav'
import { call } from '../../rpc'
import type { AgentInfo, Chat, Chats, ToolSetup } from '../../types/tools'
import { Group, SwitchRow } from '../clusters/fields'
import { basename } from '../files/format'
import { formatSize } from '../projects/size'
import { Button, Dialog, List, Row, Spinner } from '../ui'
import { ComputeGroup, FolderRow, Section, SelectRow, TextBox } from './fields'
import { sendable, short, when } from './format'
import { startAgent } from './run'

export function AgentDialog({ setup, agent: a, project = '', onClose }:
  { setup: ToolSetup; agent: AgentInfo; project?: string; onClose: () => void }) {
  const go = useGo()
  const s = a.settings
  const [remote, setRemote] = useState(s.remote)
  const [newNode, setNewNode] = useState(s.new_node)
  const [options, setOptions] = useState<Record<string, string>>(
    () => Object.fromEntries(a.options.map((o) => [o.key, String(s[o.key] ?? '')])))
  const [task, setTask] = useState('')
  const [profile, setProfile] = useState(a.profile)
  const [folder, setFolder] = useState(project || s.workdir || '~')
  const [chats, setChats] = useState<Chats | null>(null)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [more, setMore] = useState(false)

  useEffect(() => {
    // the last list at once (reading chats can take seconds on a cold cluster), then the fresh one
    let fresh = false
    const where = { cluster: setup.id, agent: a.id, folder: project }
    call<Chats | null>('tools.chats_cached', where).then((c) => { if (c && !fresh) setChats(c) }).catch(() => {})
    call<Chats>('tools.chats', where)
      .then((c) => { fresh = true; setChats(c) })
      .catch((e: Error) => { fresh = true; setError(e.message) })
  }, [setup.id, a.id, project])

  const hasNode = Boolean(setup.node)
  const asks = newNode || !hasNode
  const nodeNote = newNode ? 'A new node with:' : 'You have no node yet, so it asks for one with:'

  const run = (where: string, chatId: string, label = '') => {
    onClose()
    startAgent(setup.id, { agent: a.id, name: a.name, folder: where, chat_id: chatId, label, task: task.trim(),
      options, new_node: newNode, remote_control: remote, profile: asks ? sendable(profile) : null }, go)
  }

  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  const list = chats?.chats ?? []
  const shown = list.filter((c) => {
    const hay = `${c.name} ${c.first} ${c.last} ${c.cwd}`.toLowerCase()
    return words.every((w) => hay.includes(w))
  })
  const where = project ? `in ${basename(project)}` : `on ${setup.name}`
  const chatsNote = error ? `Could not read chats: ${error}` : !chats ? 'Loading…'
    : list.length ? `Pick one to continue it.${chats.cached ? ' Checking for newer ones…' : ''}`
      : project ? 'No chats here yet.' : 'No chats yet on this cluster.'

  const nodeLine = asks
    ? (newNode ? 'Runs on a new compute node' : 'Asks for a compute node first')
    : `Runs on your node ${setup.node} (no new job needed)`
  return (
    <Dialog title={`${a.name} ${where}`} onClose={onClose} width={600}
      actions={<>
        <Button onClick={onClose}>Cancel</Button>
        <Button kind="primary" onClick={() => run(folder.trim() || '~', '')}>Start</Button>
      </>}>
      <Section title="Task" description="Optional. What it should work on.">
        <TextBox value={task} onChange={setTask} placeholder="Fix the failing test in train.py" />
      </Section>
      <Group>
        <FolderRow cluster={setup} value={folder} onChange={setFolder} />
        <Row prefix={<Cpu size={16} className="text-dim" />} title={nodeLine}
          subtitle={asks ? undefined : `Job ${setup.job}`} />
      </Group>
      <button type="button" onClick={() => setMore(!more)}
        className="mb-3 flex items-center gap-1 font-semibold">
        {more ? <ChevronDown size={16} /> : <ChevronRight size={16} />} Options</button>
      {more && <>
        <Group>
          {a.remote_label && <SwitchRow label={a.remote_label} sub={a.remote_hint} checked={remote}
            onChange={setRemote} />}
          <SwitchRow label="Use a new compute node" checked={newNode} onChange={setNewNode}
            sub={hasNode ? `Off: your node ${setup.node}` : 'Off: one is requested when needed'} />
        </Group>
        {a.options.length > 0 && (
          <Group title={`${a.name} options`}>
            {a.options.map((o) => (
              <SelectRow key={o.key} label={o.label} value={options[o.key] ?? ''} choices={o.choices}
                onChange={(v) => setOptions({ ...options, [o.key]: v })} />
            ))}
          </Group>
        )}
        {asks && <ComputeGroup cluster={setup.id} value={profile} onChange={setProfile} description={nodeNote} />}
      </>}
      <Section title={project ? 'Or continue a chat in this project' : 'Or continue a chat'} description={chatsNote}>
        {list.length > 6 && (
          <label className="mb-2 flex h-9 items-center gap-2 rounded-lg bg-pill px-3 focus-within:ring-2
            focus-within:ring-accent">
            <Search size={16} className="shrink-0 text-dim" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search"
              className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-dim" />
          </label>
        )}
        {!chats && !error && <div className="grid place-items-center py-4"><Spinner /></div>}
        {shown.length > 0 && (
          <List>
            {shown.map((c: Chat) => (
              <Row key={c.id} title={c.name} onClick={() => run(c.cwd || '~', c.id, c.name.slice(0, 40))}
                subtitle={[when(c.mtime), short(c.cwd, chats?.home ?? ''), c.size ? formatSize(c.size) : '']
                  .filter(Boolean).join(' · ')}
                suffix={<ChevronRight size={16} className="text-dim" />} />
            ))}
          </List>
        )}
      </Section>
    </Dialog>
  )
}
