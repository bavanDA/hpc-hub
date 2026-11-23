// Setup's Connect VPN for a key page (Yale): 2026-11-22, "connect Yale VPN doesn't work". It needed a VPN login
// setup never asked for, and the button swallowed the error.
import { describe, expect, it } from 'vitest'

import panel from './KeyPanel.tsx?raw'

describe('Connect VPN in setup', () => {
  it('asks only for a username the VPN signs in with; a VPN with its own login asks on its page', () => {
    expect(panel).toContain('const askUser = !ownVpnLogin(c.vpn) && !known')
    expect(panel).not.toContain('vpn_username')
    expect(panel).toContain("call('clusters.connect', { cluster: c.id, vpn_only: true, username: user.trim() })")
    expect(panel).toContain('disabled={vpnBusy || !ready}')
  })
  it('says why it failed, never nothing', () => {
    expect(panel).not.toMatch(/\.catch\(\(\) => setWantPage\(false\)\)/)
    expect(panel).not.toMatch(/vpn_only: true \}\)\s*\.catch\(\(\) => \{\}\)/)
    expect(panel).toContain('.catch((e: Error) => setVpnError(e.message))')
    expect(panel.match(/\{vpnError && <p className="text-sm text-bad">\{vpnError\}<\/p>\}/g)).toHaveLength(2)
  })
  it("the key page opens by itself once the network is up, from step 2 only", () => {
    expect(panel).toContain('useCameUp(seen, () => { if (at === ADD) s.openPage() })')
    expect(panel).toContain("const seen = !c.vpn.enabled ? null : vpnUp ? true : watching ? reach : null")
  })
  // 2026-11-23, owner: "if the user is not on Yale VPN you should only show connect to Yale, and check every second"
  it('off the network, step 2 is only Connect: no key to copy, no "I\'m on campus"', () => {
    expect(panel).toContain('{!needVpn && <div className="flex h-10')
    expect(panel).not.toContain('ON_CAMPUS')
    expect(panel).not.toContain('setCampus')
    expect(panel).toContain("const watching = c.vpn.enabled && !!c.key_page && at === ADD && !vpnUp")
    expect(panel).toContain('const reach = useKeyPageReach(c.id, watching)')
    expect(panel).toContain('const needVpn = c.vpn.enabled && !onNet')
  })
})
