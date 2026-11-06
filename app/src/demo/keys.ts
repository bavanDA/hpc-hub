// ?nokey: no SSH key yet. ?keytest=not_yet|no_vpn|unreachable|host_key: what "Try it" finds. ?keywait=ms: a slow test.
import { fill } from '../components/clusters/loginCopy'
import { S } from '../components/clusters/loginStrings'
import type { KeyTest, MyKey } from '../types/clusters'

const sample: MyKey = { path: '/home/jdoe/.ssh/id_ed25519', file: 'id_ed25519', kind: 'ed25519', made: 1793000000, made_on: 'Oct 2026',
  public: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIExampleOnlyNotARealKeyJustForTheDemo jdoe@laptop (HPC Hub)' }
const q = new URLSearchParams(location.search)
let mine: MyKey | null = q.has('nokey') ? null : sample

function result(): KeyTest {
  const reason = (q.get('keytest') ?? 'ok') as keyof typeof S.TEST
  const kind = reason === 'ok' ? 'ok' : reason === 'not_yet' ? 'wait' : 'error'
  return { ok: reason === 'ok', kind, reason, last: '', text: fill(S.TEST[reason] ?? S.TEST.ok, { who: 'Yale' }) }
}

export const answers = {
  'keys.mine': () => mine,
  'keys.create': () => (mine ??= sample),
  'keys.use': ({ path }: { path: string }) => (mine = { ...sample, path, file: path.split('/').pop() ?? path,
    made_on: 'Mar 2025', public: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIExampleOnlyAKeyYouHadBefore jdoe@lab' }),
  'keys.test': () => new Promise<KeyTest>((done) => setTimeout(() => done(result()), Number(q.get('keywait') ?? 300))),
}
