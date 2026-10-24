// Claude, ChatGPT, Antigravity or Cursor: pick a past chat to resume, or start a new one in a folder
// (hpc_hub/agents/ui/agent_dialog.py).
import { ChevronRight, Plus, Search } from 'lucide-react'
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

  return (
    <Dialog title={`${a.name} ${where}`} onClose={onClose} width={600}>
      <Group>
        {a.remote_label && <SwitchRow label={a.remote_label} sub={a.remote_hint} checked={remote}
          onChange={setRemote} />}
        <SwitchRow label="Use a new compute node" checked={newNode} onChange={setNewNode}
          sub={hasNode ? `Off: same node as now (${setup.node}, job ${setup.job})`
            : 'Off: same node (requested if needed)'} />
      </Group>
      {a.options.length > 0 && (
        <Group title={`${a.name} options`}>
          {a.options.map((o) => (
            <SelectRow key={o.key} label={o.label} value={options[o.key] ?? ''} choices={o.choices}
              onChange={(v) => setOptions({ ...options, [o.key]: v })} />
          ))}
        </Group>
      )}
      <Section title="Task" description="Optional. What it should work on; it starts right away, in a new chat or one
        you pick below.">
        <TextBox value={task} onChange={setTask} placeholder="Fix the failing test in train.py" />
      </Section>
      {asks ? <ComputeGroup cluster={setup.id} value={profile} onChange={setProfile} description={nodeNote} /> : (
        <Group title="Compute node">
          <Row title={`Your node ${setup.node}`} subtitle={`Job ${setup.job}. Nothing to ask for`} />
        </Group>
      )}
      <Group title="New chat">
        <FolderRow cluster={setup} value={folder} onChange={setFolder} />
        <div className="flex justify-center p-3">
          <Button kind="suggested" onClick={() => run(folder.trim() || '~', '')}>
            <Plus size={16} /> Start new chat</Button>
        </div>
      </Group>
      <Section title={project ? 'Chats in this project' : 'Recent chats'} description={chatsNote}>
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
