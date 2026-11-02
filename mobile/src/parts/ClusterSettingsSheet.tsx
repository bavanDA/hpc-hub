// A cluster's settings on the phone (the desktop's SettingsDialog): a list of sections, each its own screen, and one
// Save for all of them (cluster_settings.save checks every field). Sign-in has its own sheet (LoginSheet), the VPN's
// own login included. The VPN's server settings stay as the cluster comes, so they have no section here.
import { Bot, Code, Cpu, KeyRound, ListOrdered, Plus, Server, ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'

import { priorityName, queueRowName } from '@shared/components/clusters/priority'
import { putCluster } from '@shared/components/clusters/store'
import { Spinner } from '@shared/components/ui'
import { call } from '@shared/rpc'
import type { AgentId, AgentSettings, Cluster, Limits, Logins, Profile, SettingsInfo, VsCode } from '@shared/types/clusters'
import { Field, List, MainButton, NumberRow, PickerSheet, Row, Section, Sheet, ToggleRow, useAskBeforeClose, useToast }
  from '../ui'
import { AuthenticatorSheet } from './AuthenticatorSheet'
import { LoginSheet } from './LoginSheet'
import { ASK, NodeFields, nodeSize } from './NodeSheet'

type Section = '' | 'signin' | 'compute' | 'server' | 'queues' | 'vscode' | 'agents' | 'code'

const PROFILE_KEYS: (keyof Profile)[] = ['cpus', 'mem_gb', 'gpus', 'gpu_type', 'time', 'partition', 'account', 'qos', 'extra_args']
const pick = <T extends object>(o: T, keys: (keyof T)[]) =>
  Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]))
const TEXT = { autoCapitalize: 'none', autoCorrect: 'off', spellCheck: false } as const

function changes(d: Cluster, info: SettingsInfo | null): Record<string, unknown> {
  const out: Record<string, unknown> = {
    host: d.host, port: d.port, request_node_on_connect: d.request_node_on_connect, ask_node: d.ask_node,
    reuse_running_job: d.reuse_running_job, queues: d.queues, queue_wait: d.queue_wait,
    profile: pick(d.profile, PROFILE_KEYS),
  }
  if (d.vscode) {
    const { setup, command, workdir, open_links, open_in, ask, compute } = d.vscode
    out.vscode = { setup, command, workdir, open_links, open_in, ask, compute: pick(compute, PROFILE_KEYS) }
  }
  for (const a of info?.agents ?? []) {
    const s = d[a.id]
    if (s) out[a.id] = pick(s, ['new_node', 'remote', 'workdir', ...a.options.map((o) => o.key)])
  }
  return Object.fromEntries(Object.entries(out).filter(([, x]) => x !== undefined))
}

/** "3 queues" for "general:low, debug:debug, general:standard". */
function queueCount(queues?: string) {
  const n = (queues ?? '').split(',').filter((q) => q.trim()).length
  return n === 0 ? 'The one you pick' : n === 1 ? '1 queue' : `${n} queues`
}

/** "general:low, debug:debug" as [queue, billing] pairs, and back. */
const parseQueues = (q?: string) => (q ?? '').split(',').map((x) => x.trim()).filter(Boolean)
  .map((x) => { const [queue = '', billing = ''] = x.split(':'); return [queue.trim(), billing.trim()] as [string, string] })
const joinQueues = (l: [string, string][]) => l.filter(([q]) => q).map(([q, b]) => (b ? `${q}:${b}` : q)).join(',')

/** The queues to try, in order: one row each (queue and priority), tap to change or remove, then Add a queue. */
function QueueRows({ cluster, value, onChange }: { cluster: string; value?: string; onChange: (v: string) => void }) {
  const list = parseQueues(value)
  const [edit, setEdit] = useState<number | null>(null)  // list.length: a new one
  const [pick, setPick] = useState<'' | 'queue' | 'priority'>('')
  const [limits, setLimits] = useState<Limits | null>(null)
  const cur = edit === null ? null : (list[edit] ?? ['', ''] as [string, string])
  const name = (q: string, b: string) => queueRowName(q, b, limits?.default_partition)
  useEffect(() => {  // also for the rows' names: the usual queue goes unsaid
    call<Limits>('clusters.partitions', { cluster, partition: cur?.[0] ?? '', qos: '' }).then(setLimits).catch(() => {})
  }, [cluster, edit, cur?.[0]]) // eslint-disable-line react-hooks/exhaustive-deps
  const put = (pair: [string, string] | null) => {
    const next = [...list]
    if (pair) next[edit!] = pair; else next.splice(edit!, 1)
    onChange(joinQueues(next))
  }
  const close = () => { setEdit(null); setPick('') }
  return <>
    <Section title="Tried in this order">
      {list.map(([q, b], i) => <Row key={`${q}:${b}:${i}`} label={name(q, b)} opens onPress={() => setEdit(i)} />)}
      <Row icon={Plus} label="Add a queue" onPress={() => setEdit(list.length)} />
    </Section>
    {cur && <Sheet flush title={edit! < list.length ? name(cur[0], cur[1]) : 'Add a queue'} onClose={close}
      actions={<MainButton onClick={close}>Done</MainButton>}>
      <List>
        <Row label="Queue" value={cur[0] || 'Pick one'} opens onPress={() => setPick('queue')} />
        <Row label="Priority" value={priorityName(cur[1] || limits?.default_qos)} opens
          onPress={() => setPick('priority')} />
      </List>
      {edit! < list.length && <List className="mt-6">
        <Row label="Remove this queue" danger onPress={() => { put(null); close() }} />
      </List>}
      {pick === 'queue' && <PickerSheet title="Queue" value={cur[0]}
        options={(limits?.partitions ?? []).map((q) => ({ value: q, label: q }))}
        onPick={(v) => put([v, cur[1]])} onClose={() => setPick('')} />}
      {pick === 'priority' && <PickerSheet title="Priority" value={cur[1] || limits?.default_qos || ''}
        options={(limits?.qos ?? []).map((q) => ({ value: q, label: priorityName(q) }))}
        onPick={(v) => put([cur[0] || limits?.default_partition || '', v])} onClose={() => setPick('')} />}
    </Sheet>}
  </>
}

/** One agent's choices: its own node or yours, Claude's remote control, its folder, its model and modes. */
function AgentRows({ a, value: s, onChange }: { a: SettingsInfo['agents'][number]; value: AgentSettings;
  onChange: (change: Partial<AgentSettings>) => void }) {
  const [choosing, setChoosing] = useState<keyof AgentSettings | ''>('')
  const option = a.options.find((o) => o.key === choosing)
  return (
    <Section title={a.name}>
      <ToggleRow label="Its own compute node" sub={s.new_node ? undefined : 'Runs on the node you have.'}
        checked={s.new_node} onChange={(on) => onChange({ new_node: on })} />
      {a.remote_label && <ToggleRow label={a.remote_label} sub={a.remote_hint} checked={s.remote}
        onChange={(on) => onChange({ remote: on })} />}
      {a.options.map((o) => (
        <Row key={o.key} label={o.label} value={o.choices.find(([v]) => v === s[o.key])?.[1] ?? 'Default'} opens
          onPress={() => setChoosing(o.key)} />
      ))}
      <div className="border-b border-line px-4 pb-2">
        <Field label="Folder it starts in" {...TEXT} value={s.workdir === '~' ? '' : s.workdir}
          placeholder="Home folder" onChange={(e) => onChange({ workdir: e.target.value || '~' })} />
      </div>
      {option && <PickerSheet title={option.label} value={String(s[option.key] ?? '')}
        options={option.choices.map(([value, label]) => ({ value, label }))}
        onPick={(v) => onChange({ [option.key]: v })} onClose={() => setChoosing('')} />}
    </Section>
  )
}

export function ClusterSettingsSheet({ cluster, onClose }: { cluster: Cluster; onClose: () => void }) {
  const toast = useToast()
  const [info, setInfo] = useState<SettingsInfo | null>(null)
  const [d, setD] = useState<Cluster>(cluster)
  const [user, setUser] = useState('')
  const [section, setSection] = useState<Section>('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    call<SettingsInfo>('cluster_settings.get', { cluster: cluster.id })
      .then((got) => { setInfo(got); setD(got.cluster) }).catch((e: Error) => toast(e.message))
  }, [cluster.id, toast])
  useEffect(() => {
    if (section) return  // again after the sign-in sheet closes
    call<Logins>('clusters.login', { cluster: cluster.id }).then((l) => setUser(l.ssh.username)).catch(() => {})
  }, [cluster.id, section])

  const up = (change: Partial<Cluster>) => setD((x) => ({ ...x, ...change }))
  const upVs = (change: Partial<VsCode>) => setD((x) => ({ ...x, vscode: { ...x.vscode!, ...change } }))
  const upAgent = (id: AgentId, change: Partial<AgentSettings>) => setD((x) => ({ ...x, [id]: { ...x[id]!, ...change } }))
  const back = () => setSection('')

  async function save() {
    setBusy(true)
    try {
      putCluster(await call<Cluster>('cluster_settings.save', { cluster: d.id, changes: changes(d, info) }))
      toast('Settings saved')
      onClose()
    } catch (e) {
      toast((e as Error).message)
      setBusy(false)
    }
  }

  const want = d.request_node_on_connect ?? true
  const [close, ask] = useAskBeforeClose(!!info && JSON.stringify(d) !== JSON.stringify(info.cluster), onClose)

  if (section === 'signin') return <LoginSheet cluster={d} onClose={back} />
  if (section === 'code') return <AuthenticatorSheet cluster={d} onClose={back} />
  if (section) {
    const title = { compute: 'Compute node', server: 'Server', queues: 'Queues', vscode: 'VS Code job',
      agents: 'Agents' }[section]
    return (
      <Sheet title={title} onClose={back} flush actions={<MainButton onClick={back}>Done</MainButton>}>
        {section === 'compute' && <>
          <List>
            <ToggleRow label="Get a compute node when I connect" sub="Your terminals and agents run there."
              checked={want} onChange={(on) => up({ request_node_on_connect: on })} />
          </List>
          {want && <div className="pt-5"><NodeFields cluster={d} value={d.profile} onChange={(profile) => up({ profile })} /></div>}
          <Section>
            {want && <ToggleRow label={ASK} sub="Shows the node screen when you connect."
              checked={d.ask_node ?? false} onChange={(on) => up({ ask_node: on })} />}
            <ToggleRow label="Reuse a node you already have" sub="One an agent or VS Code got earlier."
              checked={d.reuse_running_job ?? true} onChange={(on) => up({ reuse_running_job: on })} />
          </Section>
        </>}
        {section === 'server' && <div className="px-4">
          <Field label="Login host" {...TEXT} value={d.host} onChange={(e) => up({ host: e.target.value.trim() })} />
          <Field label="Port" inputMode="numeric" value={d.port ?? 22}
            onChange={(e) => up({ port: parseInt(e.target.value || '22', 10) || 22 })} />
        </div>}
        {section === 'queues' && <>
          <QueueRows cluster={d.id} value={d.queues} onChange={(queues) => up({ queues })} />
          <List className="mt-6">
            <NumberRow label="Wait for a cheaper queue" unit="seconds" min={0} value={d.queue_wait ?? 60}
              onChange={(n) => up({ queue_wait: n })} />
          </List>
        </>}
        {section === 'vscode' && d.vscode && <>
          <div className="px-4">
            <Field label="Command" {...TEXT} value={d.vscode.command} onChange={(e) => upVs({ command: e.target.value })} />
            <Field label="Runs first" {...TEXT} value={d.vscode.setup} placeholder="module load VSCode"
              onChange={(e) => upVs({ setup: e.target.value })} />
            <Field label="Folder it opens" {...TEXT} value={d.vscode.workdir === '~' ? '' : d.vscode.workdir}
              placeholder="Home folder" onChange={(e) => upVs({ workdir: e.target.value || '~' })} />
          </div>
          <List className="mt-3">
            <ToggleRow label="Ask every time" sub="Shows the VS Code screen before it starts." checked={d.vscode.ask ?? true}
              onChange={(ask) => upVs({ ask })} />
          </List>
          <h3 className="px-4 pt-5 pb-1.5 text-xs font-semibold tracking-wide text-dim uppercase">Its own node</h3>
          <NodeFields cluster={d} value={d.vscode.compute} onChange={(compute) => upVs({ compute })} />
        </>}
        {section === 'agents' && (info?.agents ?? []).map((a) => d[a.id] && (
          <AgentRows key={a.id} a={a} value={d[a.id]!} onChange={(change) => upAgent(a.id, change)} />
        ))}
      </Sheet>
    )
  }

  return (<>
    <Sheet title={`${cluster.name} settings`} onClose={close} flush
      actions={<MainButton disabled={busy || !info} onClick={save}>Save</MainButton>}>
      {!info ? <div className="grid h-40 place-items-center"><Spinner size={28} /></div> : <>
        <List>
          <Row icon={KeyRound} label="Sign-in" value={user || 'Not set'} opens onPress={() => setSection('signin')} />
          {d.second_factor === 'code' && d.code_setup && <Row icon={ShieldCheck} label="Authenticator app" opens
            onPress={() => setSection('code')} />}
          <Row icon={Cpu} label="Compute node" sub={want ? nodeSize(d) : 'Off'} opens
            onPress={() => setSection('compute')} />
        </List>
        <Section title="Advanced">
          <Row icon={Server} label="Server" value={d.host} opens onPress={() => setSection('server')} />
          <Row icon={ListOrdered} label="Queues" value={queueCount(d.queues)} opens onPress={() => setSection('queues')} />
          {d.vscode && <Row icon={Code} label="VS Code job" opens onPress={() => setSection('vscode')} />}
          {!!info.agents.length && <Row icon={Bot} label="Agents" sub={info.agents.map((a) => a.name).join(', ')} opens
            onPress={() => setSection('agents')} />}
        </Section>
      </>}
    </Sheet>
    {ask}
  </>)
}
