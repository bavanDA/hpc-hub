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

// A real QR code of the sample key (its rows in hex), so the demo's key screen can be scanned too.
const QR = ('0000000000000 0000000000000 0000000000000 0000000000000 01fd484cc87f0 010575a046410 017589d8a45d0 '
  + '0174c127d15d0 01752a645c5d0 0104229a09410 01fd5555557f0 00000a4283000 013f2603ff970 0199c928c3b60 '
  + '01f732863c980 01d3bec5595b0 012e20a33ac30 00238278365d0 00ceaf33a2710 0102d71245ff0 016fa591ba240 '
  + '01dac0fc8f120 002cf7f2f6570 006a2e28a2a60 002f5869be6e0 01a2f3ac64760 00df90526cc40 002ac6f658ca0 '
  + '01b4ef8296600 012b625bd93d0 00962478b6e50 005bd037534d0 00d46296b9b10 013ab3932d1c0 01cd15deb3790 '
  + '01a1314187350 019c1581c9f30 000199e6e7190 01fd801bbf540 0105f062af190 0175229f8bfd0 01754de6fe060 '
  + '0174bf7da7190 0104e850015d0 01fd45fd27200 0000000000000 0000000000000 0000000000000 0000000000000 ').trim().split(' ')

function qrSvg(): string {
  const size = QR.length
  const dark = QR.flatMap((row, y) => BigInt('0x' + row).toString(2).padStart(size, '0').split('')
    .flatMap((c, x) => (c === '1' ? [`M${x} ${y}h1v1h-1z`] : []))).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">`
    + `<rect width="${size}" height="${size}" fill="#fff"/><path d="${dark}" fill="#000"/></svg>`
}

export const answers = {
  'keys.mine': () => mine,
  'keys.qr': () => (mine ? qrSvg() : null),
  'keys.create': () => (mine ??= sample),
  'keys.use': ({ path }: { path: string }) => (mine = { ...sample, path, file: path.split('/').pop() ?? path,
    made_on: 'Mar 2025', public: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIExampleOnlyAKeyYouHadBefore jdoe@lab' }),
  'keys.test': () => new Promise<KeyTest>((done) => setTimeout(() => done(result()), Number(q.get('keywait') ?? 300))),
}
