// Start Claude, ChatGPT, Antigravity or Cursor on a cluster: an optional task, the folder, where it runs, the
// agent's own options folded away, and the chats you can continue. The desktop's agent dialog, as a phone sheet.
import { ChevronDown, ChevronRight, MessageSquare } from 'lucide-react'
import { useEffect, useState } from 'react'

import { basename } from '@shared/components/files/format'
import { formatSize } from '@shared/components/projects/size'
import { sendable, short, when } from '@shared/components/tools/format'
import { startAgent } from '@shared/components/tools/run'
import { Spinner } from '@shared/components/ui'
import { useGo } from '@shared/nav'
import { call } from '@shared/rpc'
import type { AgentInfo, AgentOption, Chats, ToolSetup } from '@shared/types/tools'
import { Button, Card, ListRow, PickerSheet, SearchField, Sheet, Switch, TextArea } from '../../ui'
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
  const [more, setMore] = useState(false)
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
  const line = asks ? (newNode ? 'Runs on a new compute node' : 'Asks for a compute node first')
    : `Runs on your node ${setup.node}`
  const label = (o: AgentOption) => o.choices.find(([v]) => v === (options[o.key] ?? ''))?.[1] ?? 'Default'

  return (
    <Sheet title={`${a.name} ${project ? `in ${basename(project)}` : `on ${setup.name}`}`} onClose={onClose}
      actions={<Button kind="primary" className="flex-1" onClick={() => run(folder.trim() || '~', '')}>Start</Button>}>
      <TextArea label="Task (optional)" value={task} onChange={(e) => setTask(e.target.value)}
        placeholder="Fix the failing test in train.py" />
      <FolderField cluster={setup.id} name={setup.name} value={folder} onChange={setFolder} />
      <div className="my-2">
        <NodeRow line={line} sub={asks ? undefined : `Job ${setup.job}, no new job needed`}
          profile={asks ? profile : undefined} onChange={asks ? setProfile : undefined} />
      </div>
      <button onClick={() => setMore(!more)} className="flex h-12 items-center gap-1 font-semibold">
        {more ? <ChevronDown size={18} /> : <ChevronRight size={18} />} Options</button>
      {more && (
        <Card className="mb-3 py-1">
          {a.remote_label && <Switch label={a.remote_label} hint={a.remote_hint} checked={remote} onChange={setRemote} />}
          <Switch label="Use a new compute node" checked={newNode} onChange={setNewNode}
            hint={setup.node ? `Off: your node ${setup.node}` : 'Off: one is asked for when needed'} />
          {a.options.map((o) => <ListRow key={o.key} title={o.label} subtitle={label(o)} onClick={() => setChoosing(o)} />)}
        </Card>
      )}
      <h2 className="mt-4 mb-1 font-bold">Or continue a chat</h2>
      <p className="mb-2 text-sm text-dim">{error ? `Could not read chats: ${error}` : !chats ? 'Loading your chats…'
        : list.length ? `Tap one to continue it.${chats.cached ? ' Checking for newer ones…' : ''}`
          : project ? 'No chats here yet.' : 'No chats yet on this cluster.'}</p>
      {list.length > 6 && <div className="mb-2"><SearchField value={query} onChange={setQuery} placeholder="Search chats" /></div>}
      {!chats && !error && <div className="grid place-items-center py-6"><Spinner /></div>}
      {shown.length > 0 && (
        <Card className="py-1">
          {shown.map((c) => (
            <ListRow key={c.id} icon={MessageSquare} title={c.name} onClick={() => run(c.cwd || '~', c.id, c.name.slice(0, 40))}
              subtitle={[when(c.mtime), short(c.cwd, chats?.home ?? ''), c.size ? formatSize(c.size) : '']
                .filter(Boolean).join(' · ')} />
          ))}
        </Card>
      )}
      {choosing && <PickerSheet title={choosing.label} value={options[choosing.key] ?? ''}
        options={choosing.choices.map(([value, text]) => ({ value, label: text }))}
        onPick={(v) => setOptions({ ...options, [choosing.key]: v })} onClose={() => setChoosing(null)} />}
    </Sheet>
  )
}
