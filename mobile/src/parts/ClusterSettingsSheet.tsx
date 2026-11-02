// A cluster's settings on the phone (the desktop's SettingsDialog): a list of sections, each its own screen, and one
// Save for all of them (cluster_settings.save checks every field). Sign-in has its own sheet (LoginSheet). The VPN
// sections stay hidden until the phone has a VPN.
import { Bot, Code, Cpu, KeyRound, ListOrdered, Server, ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'

import { putCluster } from '@shared/components/clusters/store'
import { Spinner } from '@shared/components/ui'
import { call } from '@shared/rpc'
import type { AgentId, AgentSettings, Cluster, Profile, SettingsInfo, VsCode } from '@shared/types/clusters'
import { secondStep } from '@shared/types/clusters'
import { Button, Field, ListRow, PickerSheet, Sheet, Switch, useToast } from '../ui'
import { AuthenticatorSheet } from './AuthenticatorSheet'
import { LoginSheet } from './LoginSheet'
import { AskFirst, NodeFields, nodeLine } from './NodeSheet'

type Section = '' | 'signin' | 'compute' | 'server' | 'queues' | 'vscode' | 'agents' | 'code'

const PROFILE_KEYS: (keyof Profile)[] = ['cpus', 'mem_gb', 'gpus', 'gpu_type', 'time', 'partition', 'account', 'qos', 'extra_args']
const pick = <T extends object>(o: T, keys: (keyof T)[]) =>
  Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]))

function changes(d: Cluster, info: SettingsInfo | null): Record<string, unknown> {
  const out: Record<string, unknown> = {
    host: d.host, port: d.port, request_node_on_connect: d.request_node_on_connect, ask_node: d.ask_node,
    reuse_running_job: d.reuse_running_job, queues: d.queues, queue_wait: d.queue_wait,
    profile: pick(d.profile, PROFILE_KEYS),
  }
  if (d.vscode) {
    const { setup, command, workdir, open_links, open_in, compute } = d.vscode
    out.vscode = { setup, command, workdir, open_links, open_in, compute: pick(compute, PROFILE_KEYS) }
  }
  for (const a of info?.agents ?? []) {
    const s = d[a.id]
    if (s) out[a.id] = pick(s, ['new_node', 'remote', 'workdir', ...a.options.map((o) => o.key)])
  }
  return Object.fromEntries(Object.entries(out).filter(([, x]) => x !== undefined))
}

/** One agent's choices: its own node or yours, Claude's remote control, its folder, its model and modes. */
function AgentRows({ a, value: s, onChange }: { a: SettingsInfo['agents'][number]; value: AgentSettings;
  onChange: (change: Partial<AgentSettings>) => void }) {
  const [choosing, setChoosing] = useState<keyof AgentSettings | ''>('')
  const option = a.options.find((o) => o.key === choosing)
  return (
    <section className="mb-6">
      <h3 className="mb-1 text-sm font-bold text-dim">{a.name}</h3>
      <Switch label="Its own compute node" hint="Off: it runs on the node you have." checked={s.new_node}
        onChange={(on) => onChange({ new_node: on })} />
      {a.remote_label && <Switch label={a.remote_label} hint={a.remote_hint} checked={s.remote}
        onChange={(on) => onChange({ remote: on })} />}
      <Field label="Folder it starts in" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={s.workdir}
        placeholder="Your home folder" onChange={(e) => onChange({ workdir: e.target.value })} />
      {a.options.map((o) => (
        <ListRow key={o.key} title={o.label}
          subtitle={o.choices.find(([v]) => v === s[o.key])?.[1] ?? 'Default'} onClick={() => setChoosing(o.key)} />
      ))}
      {option && <PickerSheet title={option.label} value={String(s[option.key] ?? '')}
        options={option.choices.map(([value, label]) => ({ value, label }))}
        onPick={(v) => onChange({ [option.key]: v })} onClose={() => setChoosing('')} />}
    </section>
  )
}

export function ClusterSettingsSheet({ cluster, onClose }: { cluster: Cluster; onClose: () => void }) {
  const toast = useToast()
  const [info, setInfo] = useState<SettingsInfo | null>(null)
  const [d, setD] = useState<Cluster>(cluster)
  const [section, setSection] = useState<Section>('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    call<SettingsInfo>('cluster_settings.get', { cluster: cluster.id })
      .then((got) => { setInfo(got); setD(got.cluster) }).catch((e: Error) => toast(e.message))
  }, [cluster.id, toast])

  const up = (change: Partial<Cluster>) => setD((x) => ({ ...x, ...change }))
  const upVs = (change: Partial<VsCode>) => setD((x) => ({ ...x, vscode: { ...x.vscode!, ...change } }))
  const upAgent = (id: AgentId, change: Partial<AgentSettings>) => setD((x) => ({ ...x, [id]: { ...x[id]!, ...change } }))
  const back = () => setSection('')

  async function save() {
    setBusy(true)
    try {
      putCluster(await call<Cluster>('cluster_settings.save', { cluster: d.id, changes: changes(d, info) }))
      toast(`${d.name} settings saved`)
      onClose()
    } catch (e) {
      toast((e as Error).message)
      setBusy(false)
    }
  }

  const want = d.request_node_on_connect ?? true
  const saveBar = <>
    <Button className="flex-1" onClick={onClose}>Cancel</Button>
    <Button kind="primary" className="flex-1" disabled={busy || !info} onClick={save}>Save</Button></>

  if (section === 'signin') return <LoginSheet cluster={d} onClose={back} />
  if (section === 'code') return <AuthenticatorSheet cluster={d} onClose={back} />
  if (section) {
    const title = { compute: 'Compute node', server: 'Server', queues: 'Queues', vscode: 'VS Code job',
      agents: 'Agents' }[section]
    return (
      <Sheet title={title} onClose={back} actions={<Button kind="primary" className="flex-1" onClick={back}>Done</Button>}>
        {section === 'compute' && <>
          <Switch label="Get a compute node when I connect" hint="Your terminals and agents run there."
            checked={want} onChange={(on) => up({ request_node_on_connect: on })} />
          {want && <div className="-mx-4 py-2"><NodeFields cluster={d} value={d.profile} onChange={(profile) => up({ profile })} /></div>}
          <Switch label="Reuse a node you already have" hint="A node an agent or VS Code got earlier, instead of a new one."
            checked={d.reuse_running_job ?? false} onChange={(on) => up({ reuse_running_job: on })} />
          {want && <AskFirst checked={d.ask_node ?? false} onChange={(on) => up({ ask_node: on })} />}
        </>}
        {section === 'server' && <>
          <Field label="Login host" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={d.host}
            onChange={(e) => up({ host: e.target.value.trim() })} />
          <Field label="Port" inputMode="numeric" value={d.port ?? 22}
            onChange={(e) => up({ port: parseInt(e.target.value || '22', 10) || 22 })} />
        </>}
        {section === 'queues' && <>
          <p className="mb-2 text-sm text-dim">Queues to try in order, cheapest first, as queue:priority. HPC Hub takes
            the first that starts soon enough, else the one that starts soonest.</p>
          <Field label="Queues" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={d.queues ?? ''}
            placeholder="general:low, general:standard" onChange={(e) => up({ queues: e.target.value })} />
          <Field label="Wait this long for a cheaper queue (seconds)" inputMode="numeric" value={d.queue_wait ?? 60}
            onChange={(e) => up({ queue_wait: parseInt(e.target.value || '0', 10) || 0 })} />
        </>}
        {section === 'vscode' && d.vscode && <>
          <Field label="Command" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={d.vscode.command}
            onChange={(e) => upVs({ command: e.target.value })} />
          <Field label="Runs first" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={d.vscode.setup}
            placeholder="e.g. module load VSCode" onChange={(e) => upVs({ setup: e.target.value })} />
          <Field label="Folder it opens" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={d.vscode.workdir}
            placeholder="Your home folder" onChange={(e) => upVs({ workdir: e.target.value })} />
          <p className="mt-3 text-sm font-bold text-dim">Its compute node</p>
          <div className="-mx-4"><NodeFields cluster={d} value={d.vscode.compute} onChange={(compute) => upVs({ compute })} /></div>
        </>}
        {section === 'agents' && (info?.agents ?? []).map((a) => d[a.id] && (
          <AgentRows key={a.id} a={a} value={d[a.id]!} onChange={(change) => upAgent(a.id, change)} />
        ))}
      </Sheet>
    )
  }

  return (
    <Sheet title={`${cluster.name} settings`} onClose={onClose} actions={saveBar}>
      {!info ? <div className="grid h-40 place-items-center"><Spinner size={28} /></div> : <>
        <ListRow icon={KeyRound} title="Sign-in" subtitle={secondStep(d)} onClick={() => setSection('signin')} />
        {d.second_factor === 'code' && d.code_setup && <ListRow icon={ShieldCheck} title="Set up your authenticator app"
          onClick={() => setSection('code')} />}
        <ListRow icon={Cpu} title="Compute node" subtitle={want ? nodeLine(d).replace('Gets a node: ', '') : 'Off'}
          onClick={() => setSection('compute')} />
        <p className="mt-5 mb-1 text-sm font-bold text-dim">Advanced</p>
        <ListRow icon={Server} title="Server" subtitle={d.host} onClick={() => setSection('server')} />
        <ListRow icon={ListOrdered} title="Queues" subtitle={d.queues || 'Only the queue you pick'}
          onClick={() => setSection('queues')} />
        {d.vscode && <ListRow icon={Code} title="VS Code job" subtitle={d.vscode.command}
          onClick={() => setSection('vscode')} />}
        {!!info.agents.length && <ListRow icon={Bot} title="Agents" subtitle={info.agents.map((a) => a.name).join(', ')}
          onClick={() => setSection('agents')} />}
      </>}
    </Sheet>
  )
}
