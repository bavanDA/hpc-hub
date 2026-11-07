import { describe, expect, it } from 'vitest'

import type { Cluster, SettingsInfo } from '../../../types/clusters'
import { changes, firstPart } from './changes'

describe('firstPart', () => {
  it.each([
    ['', false, ''], ['nope', true, 'server'], ['login', true, 'server'], ['compute', true, 'compute'],
    ['vscode', false, 'vscode'], ['agents', true, 'agents'],
  ])('%s, advanced %s -> %s', (start, advanced, want) => expect(firstPart(start, advanced)).toBe(want))
})

const cluster = {
  id: 'wulver', name: 'Wulver (NJIT)', host: 'login.example.edu', port: 22, portal: 'https://example.edu',
  vpn: { enabled: true, gateway: 'vpn.example.edu', protocol: undefined },
  profile: { cpus: 4, mem_gb: 16, time: '04:00:00', partition: 'general', qos: 'low' },
  claude: { command: 'claude', workdir: '~', new_node: true, remote: false, model: 'opus', mode: '', effort: '',
    sandbox: '', approval: '' },
} as Cluster

describe('changes', () => {
  it('keeps only the fields the dialog edits', () => {
    const agents = [{ id: 'claude', name: 'Claude', remote_label: '', remote_hint: '',
      options: [{ key: 'model', label: 'Model', choices: [] }] }] as SettingsInfo['agents']
    expect(changes(cluster, agents)).toEqual({
      host: 'login.example.edu', port: 22,
      vpn: { enabled: true, gateway: 'vpn.example.edu' },
      profile: { cpus: 4, mem_gb: 16, time: '04:00:00', partition: 'general', qos: 'low' },
      claude: { new_node: true, remote: false, workdir: '~', model: 'opus' },
    })
  })
  it('leaves out agents the backend does not list', () => expect(changes(cluster)).not.toHaveProperty('claude'))
})
