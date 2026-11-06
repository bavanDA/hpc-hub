import type { Cluster, SettingsInfo } from '../../../types/clusters'
import { ChoiceRow } from '../../e/ChoiceRow'
import { Field } from '../../e/Field'
import { List } from '../../e/List'
import { NumberRow } from '../../e/NumberRow'
import { Section } from '../../e/Section'
import { Segments } from '../../e/Segments'
import { ToggleRow } from '../../e/ToggleRow'
import { CHROME_WINDOW } from '../chromeWindow'
import { copy } from '../loginCopy'
import { ownVpnLogin } from './changes'

export type VpnLogin = { user: string; setUser: (u: string) => void; password: string
  setPassword: (p: string) => void; saved: boolean }

export function ServerPart({ d, info, up, vpnLogin }: {
  d: Cluster; info: SettingsInfo | null; up: (change: Partial<Cluster>) => void; vpnLogin: VpnLogin
}) {
  const v = d.vpn
  const upVpn = (change: Partial<Cluster['vpn']>) => up({ vpn: { ...v, ...change } })
  const win = info?.chrome_window
  const signIn: [string, string][] = [['', 'Built-in window'],
    ...(win && (win.offered || v.browser === win.value) ? [[win.value, CHROME_WINDOW.title] as [string, string]] : [])]
  const protocol = v.protocol ?? 'anyconnect'
  return <>
    <div className="px-5">
      <Field label="Login host" value={d.host} placeholder="login.example.edu"
        onChange={(e) => up({ host: e.target.value.trim() })} />
    </div>
    <div className="pt-3"><List>
      <NumberRow label="SSH port" unit="" showUnit={false} value={d.port ?? 22} max={65535}
        onChange={(port) => up({ port })} />
    </List></div>
    <Section title="VPN">
      <ToggleRow label="Use VPN" checked={v.enabled} onChange={(enabled) => upVpn({ enabled })} />
    </Section>
    {v.enabled && <>
      <div className="px-5 pt-3">
        <Field label="Gateway" value={v.gateway} placeholder="vpn.example.edu"
          onChange={(e) => upVpn({ gateway: e.target.value })} />
        {signIn.length > 1 && <div className="py-1.5">
          <p className="mb-1.5 text-sm text-dim">Sign in with</p>
          <Segments label="Sign in with" value={v.browser ?? ''} options={signIn}
            onChange={(browser) => upVpn({ browser })} />
        </div>}
      </div>
      <div className="pt-4"><List>
        <ChoiceRow label="Protocol" value={protocol} onChange={(p) => upVpn({ protocol: p })}
          options={(info?.protocols ?? [protocol]).map((p) => ({ value: p, label: p }))} />
        <ToggleRow label="Split tunnel" sub="Only the domains and networks below go through this VPN."
          checked={v.split_tunnel ?? true} onChange={(split_tunnel) => upVpn({ split_tunnel })} />
      </List></div>
      <div className="px-5 pt-3">
        {(v.split_tunnel ?? true) && <>
          <Field label="VPN domains" value={v.domains ?? ''} placeholder="example.edu"
            onChange={(e) => upVpn({ domains: e.target.value })} />
          <Field label="VPN networks, space separated" value={v.routes ?? ''} placeholder="10.0.0.0/16"
            onChange={(e) => upVpn({ routes: e.target.value })} />
        </>}
        <Field label="User agent (optional)" value={v.useragent ?? ''}
          onChange={(e) => upVpn({ useragent: e.target.value })} />
        <Field label="Group (optional)" value={v.authgroup ?? ''}
          onChange={(e) => upVpn({ authgroup: e.target.value })} />
      </div>
      <Section title="VPN login">
        <ToggleRow label="Same login as the cluster" checked={v.same_login_as_ssh ?? true}
          onChange={(same_login_as_ssh) => upVpn({ same_login_as_ssh })} />
      </Section>
    </>}
    {ownVpnLogin(v) && <div className="px-5 pt-2">
      <Field label="VPN username" value={vpnLogin.user} placeholder="jdoe@example.edu"
        onChange={(e) => vpnLogin.setUser(e.target.value)} />
      <Field label="VPN password" type="password" value={vpnLogin.password}
        onChange={(e) => vpnLogin.setPassword(e.target.value)}
        placeholder={vpnLogin.saved ? copy.saved : 'Same as the cluster password'} />
    </div>}
  </>
}
