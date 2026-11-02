// Start Claude, ChatGPT, Antigravity or Cursor on a cluster: an optional task, the folder, where it runs, the
// agent's own options, and the chats you can continue. The desktop's agent dialog, as a phone sheet.
import { MessageSquare } from 'lucide-react'
import { useEffect, useState } from 'react'

import { basename } from '@shared/components/files/format'
import { formatSize } from '@shared/components/projects/size'
import { sendable, short, when } from '@shared/components/tools/format'
import { startAgent } from '@shared/components/tools/run'
import { Spinner } from '@shared/components/ui'
import { useGo } from '@shared/nav'
import { call } from '@shared/rpc'
import type { AgentInfo, AgentOption, Chats, ToolSetup } from '@shared/types/tools'
import { MainButton, PickerSheet, Row, SearchField, Section, Sheet, TextArea, ToggleRow } from '../../ui'
import { FolderField } from './FolderField'
import { NodeRow } from './NodeFields'

export function AgentSheet({ setup, agent: a, project = '', onClose }:
  { setup: ToolSetup; agent: AgentInfo; project?: string; onClose: () => void }) {
  const go = useGo()
  const s = a.settings
  const [task, setTask] = useState('')
  const [folder, setFolder] = useState(project || s.workdir || '~')
  const [remote, setRemote] = useState(s.remote)
  const [newNode, setNewNode] = useState(s.new_node)
  const [profile, setProfile] = useState(a.profile)
  const [options, setOptions] = useState<Record<string, string>>(
    () => Object.fromEntries(a.options.map((o) => [o.key, String(s[o.key] ?? '')])))
  const [choosing, setChoosing] = useState<AgentOption | null>(null)
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
  const label = (o: AgentOption) => o.choices.find(([v]) => v === (options[o.key] ?? ''))?.[1] ?? 'Default'
  const status = error ? `Could not read chats: ${error}` : !chats ? 'Loading your chats…'
    : list.length ? (chats.cached ? 'Checking for newer ones…' : '')
      : project ? 'No chats here yet.' : 'No chats yet.'

  return (
    <Sheet title={`${a.name} ${project ? `in ${basename(project)}` : `on ${setup.name.split(' (')[0]}`}`} flush
      onClose={onClose} actions={<MainButton onClick={() => run(folder.trim() || '~', '')}>Start</MainButton>}>
      <div className="px-4">
        <TextArea label="Task (optional)" value={task} onChange={(e) => setTask(e.target.value)}
          placeholder="Fix the failing test in train.py" />
        <FolderField cluster={setup.id} name={setup.name} value={folder} onChange={setFolder} />
      </div>
      <Section>
        <ToggleRow label="Use a new compute node" checked={newNode} onChange={setNewNode}
          sub={newNode ? 'A node just for this agent' : setup.node ? `Shares ${setup.node} with your terminals`
            : 'Gets a node when it starts'} />
        {asks && <NodeRow cluster={setup.id} profile={profile} onChange={setProfile}
          label={newNode ? 'New compute node' : 'Compute node'} />}
        {a.remote_label && <ToggleRow label={a.remote_label} sub={a.remote_hint} checked={remote} onChange={setRemote} />}
        {a.options.map((o) => <Row key={o.key} label={o.label} value={label(o)} onPress={() => setChoosing(o)} />)}
      </Section>
      <Section title="Or continue a chat" note={status || undefined}>
        {list.length > 6 && <div className="border-b border-line px-4 py-2">
          <SearchField value={query} onChange={setQuery} placeholder="Search chats" /></div>}
        {!chats && !error && <div className="grid place-items-center border-b border-line py-6"><Spinner /></div>}
        {shown.map((c) => (
          <Row key={c.id} icon={MessageSquare} label={c.name} onPress={() => run(c.cwd || '~', c.id, c.name.slice(0, 40))}
            sub={[when(c.mtime), short(c.cwd, chats?.home ?? ''), c.size ? formatSize(c.size) : '']
              .filter(Boolean).join(' · ')} />
        ))}
      </Section>
      {choosing && <PickerSheet title={choosing.label} value={options[choosing.key] ?? ''}
        options={choosing.choices.map(([value, text]) => ({ value, label: text }))}
        onPick={(v) => setOptions({ ...options, [choosing.key]: v })} onClose={() => setChoosing(null)} />}
    </Sheet>
  )
}
