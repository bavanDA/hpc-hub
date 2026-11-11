// Demo answers for bug reports (hpc_hub/api/methods/report.py): the made-up names hidden as the backend would, and a
// pretend send. ?report=offline, ?report=busy or ?report=refused show the failures. A test may set
// window.hpcDemoBackend to hand these calls to the real backend instead (real scrubbing, a local stand-in server).

type Backend = (method: string, params: unknown) => Promise<unknown>
const backend = () => (window as { hpcDemoBackend?: Backend }).hpcDemoBackend

const NAMES: [RegExp, string][] = [
  [/[\w.+-]+@[\w-]+(\.[\w-]+)*\.[a-z]{2,}/gi, '<email>'],
  [/\/home\/jdoe/g, '<home>'],
  [/(?<![A-Za-z0-9<])jdoe(?![A-Za-z0-9>])/gi, '<user>'],
  [/(?<![A-Za-z0-9<])mygroup(?![A-Za-z0-9>])/gi, '<group>'],
  [/(?<![A-Za-z0-9<])abc123(?![A-Za-z0-9>])/gi, '<account>'],
  [/(?<![\d.])(\d{1,3}\.){3}\d{1,3}(?![\d.])/g, '<ip>'],
  [/(password|token)\s*[:=]\s*\S+/gi, '$1=<hidden>'],
]
const scrub = (text: string) => NAMES.reduce((t, [re, to]) => t.replace(re, to), text)

const LOG = [
  'Wulver connection log',
  '09:14:02  Connecting to wulver.njit.edu as jdoe',
  '09:14:03  VPN already up (10.0.4.17)',
  '09:14:05  Signed in',
  '09:14:06  Node n0042 for job 551203, account abc123',
].join('\n')

type Preview = { kind?: string; error?: string; lines?: string[]; page?: string }
type Sent = { report: Record<string, string>; screenshot?: string }

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

export const answers: Record<string, unknown> = {
  'report.preview': async (p: Preview) => {
    const real = backend()
    if (real) return real('report.preview', p)
    await wait(250)
    const lines = p.lines?.length ? `In the app\n${p.lines.join('\n')}\n\n` : ''
    return { kind: p.kind ?? 'error', error: p.kind === 'user' ? '' : scrub(p.error ?? ''),
      log: scrub(`${lines}${LOG}`), page: scrub(p.page ?? ''), app: '0.1.0', platform: 'linux',
      os: 'Fedora Linux 44 (Workstation Edition), kernel 7.2.13' }
  },
  'report.scrub': async ({ text }: { text: string }) => {
    const real = backend()
    return real ? real('report.scrub', { text }) : scrub(text)
  },
  'report.send': async (p: Sent) => {
    const real = backend()
    if (real) return real('report.send', p)
    await wait(700)
    const asked = new URLSearchParams(location.search).get('report')
    if (asked === 'offline') {
      throw new Error('Could not reach the report server. Check that you are online and try again.')
    }
    if (asked === 'busy') throw new Error('Too many reports were sent from here lately. Please try again in an hour.')
    if (asked === 'refused') throw new Error('The report server turned the report down: text is too long')
    return { id: 'r7k2m9' }
  },
}
