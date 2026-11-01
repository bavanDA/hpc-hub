// This computer's SSH key (methods/keys.py). ?nokey starts without one, to show "Make my key".
import type { MyKey } from '../types/clusters'

const sample: MyKey = { path: '/home/jdoe/.ssh/id_ed25519', kind: 'ed25519', made: 1793000000, made_on: 'Oct 2026',
  public: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIExampleOnlyNotARealKeyJustForTheDemo jdoe@laptop (HPC Hub)' }
let mine: MyKey | null = new URLSearchParams(location.search).has('nokey') ? null : sample

export const answers = {
  'keys.mine': () => mine,
  'keys.create': () => (mine ??= sample),
  'keys.test': ({ username }: { username: string }) => username.trim()
    ? { ok: true, text: 'It works.' } : { ok: false, text: 'Type your username first.' },
}
