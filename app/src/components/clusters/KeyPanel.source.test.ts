// Setup's Connect VPN for a key page (Yale): 2026-11-22, "connect Yale VPN doesn't work". It needed a VPN login
// setup never asked for, and the button swallowed the error.
import { describe, expect, it } from 'vitest'

import panel from './KeyPanel.tsx?raw'

describe('Connect VPN in setup', () => {
  it('asks for what the VPN signs in with when nothing is saved: its own login, else the username', () => {
    expect(panel).toContain("call<{ vpn: { username: string } }>('clusters.login', { cluster: c.id })")
    expect(panel).toContain('const askVpnUser = own && vpnSaved === false')
    expect(panel).toContain('const askUser = !own && !known')
    expect(panel).toContain('vpn_username: vpnUser.trim()')
    expect(panel).toContain('disabled={vpnBusy || !ready}')
  })
  it('says why it failed, never nothing', () => {
    expect(panel).not.toMatch(/\.catch\(\(\) => setWantPage\(false\)\)/)
    expect(panel).not.toMatch(/vpn_only: true \}\)\s*\.catch\(\(\) => \{\}\)/)
    expect(panel).toContain('.catch((e: Error) => { setWantPage(false); setVpnError(e.message) })')
    expect(panel.match(/\{vpnError && <p className="text-sm text-bad">\{vpnError\}<\/p>\}/g)).toHaveLength(2)
  })
  it("the key page opens by itself once the VPN is up, from step 2 only", () => {
    expect(panel).toContain('onClick={() => connectVpn()}')
    expect(panel).toContain('onClick={() => connectVpn(false)}')
  })
})
