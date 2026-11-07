import { Bot, Code, Cpu, KeyRound, Server, ShieldCheck } from 'lucide-react'

import { summary, type Cluster, type SettingsInfo } from '../../../types/clusters'
import { List } from '../../e/List'
import { Row } from '../../e/Row'
import { Section } from '../../e/Section'
import { Spinner } from '../../ui/Spinner'
import type { Part } from './changes'

export function Overview({ d, info, user, open, onAuthenticator }: {
  d: Cluster; info: SettingsInfo | null; user: string; open: (part: Part) => void; onAuthenticator: () => void
}) {
  if (!info) return <div className="grid h-40 place-items-center"><Spinner size={28} /></div>
  const want = d.request_node_on_connect ?? true
  return <>
    <List>
      <Row icon={KeyRound} label="Sign-in" value={user || 'Not set'} opens onPress={() => open('login')} />
      {d.second_factor === 'code' && d.code_setup && <Row icon={ShieldCheck} label="Authenticator app" opens
        onPress={onAuthenticator} />}
      <Row icon={Cpu} label="Compute node" sub={want ? summary(d.profile) : 'Off'} opens
        onPress={() => open('compute')} />
    </List>
    <Section title="Advanced" note="Changes apply the next time you connect.">
      <Row icon={Server} label="Server and VPN" value={d.host} opens onPress={() => open('server')} />
      {d.vscode && <Row icon={Code} label="VS Code job" opens onPress={() => open('vscode')} />}
      {!!info.agents.length && <Row icon={Bot} label="Agents" sub={info.agents.map((a) => a.name).join(', ')} opens
        onPress={() => open('agents')} />}
    </Section>
  </>
}
