// Demo answers for asking an agent about code (code_ask.py), sending text into a session, submitting a job script
// and the phone's QR code. An ask "runs" for a few seconds, then answers about the file it was asked about.
import type { AskResult, AskStatus } from '../types/code'
import { current } from './code'

type Started = AskStatus & { at: number; question: string; base?: { text: string; sha: string } }
const asks: Record<string, Started> = {}

type Answer = Pick<AskResult, 'answer' | 'files'>

const nameOf = (path: string) => path.slice(path.lastIndexOf('/') + 1)
const folderOf = (path: string) => path.slice(0, path.lastIndexOf('/'))
const changed = (path: string, base: { text: string; sha: string }, proposed: string) =>
  ({ path, base_sha: base.sha, original: base.text, proposed, is_new: false })

/** What the demo agent says about the file it was asked about, worked out from the file as it is. */
function answer(a: Started): Answer {
  const name = nameOf(a.path)
  const text = a.base?.text ?? ''
  if (a.kind === 'explain') {
    return { answer: `\`${name}\` trains the model for a fixed number of epochs and prints the loss after each one.`
      + ' The learning rate and the number of epochs are set at the top.', files: [] }
  }
  if (a.kind === 'fix') {
    const configPath = `${folderOf(a.path)}/config.yaml`
    const config = current(configPath)
    if (config?.text.includes('batch_size: 64')) {
      return {
        answer: 'The GPU ran out of memory in `net.step(opt)`. A batch of 64 grids is too big for it, so I halved it'
          + ' in `config.yaml`.',
        files: [changed(configPath, config, config.text.replace('batch_size: 64', 'batch_size: 32'))],
      }
    }
    return { answer: `I couldn't find the cause in \`${name}\`. The error comes from code it calls.`, files: [] }
  }
  if (a.kind === 'test' && name.endsWith('.py')) {
    const module = name.replace(/\.py$/, '')
    return {
      answer: `I wrote a test that checks the settings in \`${name}\` make sense.`,
      files: [{ path: `${folderOf(a.path)}/tests/test_${name}`, base_sha: '', original: '', is_new: true,
        proposed: `from ${module} import EPOCHS, LR\n\n\ndef test_settings():\n    assert 0 < LR < 1\n`
          + '    assert EPOCHS > 0\n' }],
    }
  }
  if (a.base && /^LR = .*$/m.test(text) && /^EPOCHS = .*$/m.test(text)) {
    const proposed = text
      .replace(/^import torch$/m, 'import argparse\n\nimport torch')
      .replace(/^def main\(\):$/m, 'def main():\n    parser = argparse.ArgumentParser()\n'
        + '    parser.add_argument("--lr", type=float, default=LR)\n'
        + '    parser.add_argument("--epochs", type=int, default=EPOCHS)\n    args = parser.parse_args()')
      .replace('lr=LR)', 'lr=args.lr)').replace('range(EPOCHS)', 'range(args.epochs)')
    return {
      answer: 'You can now set both when you run it, like `python train.py --lr 0.0005 --epochs 50`.'
        + ' Without them it uses the values at the top of the file.',
      files: [changed(a.path, a.base, proposed)],
    }
  }
  return { answer: `Nothing in \`${name}\` needs to change for that.`, files: [] }
}

function now(a: Started): AskStatus {
  const s = (Date.now() - a.at) / 1000
  const { at: _at, question: _q, base: _base, ...status } = a
  if (a.state === 'cancelled') return status
  const state = s < 1.5 ? 'starting' : s < 4 ? 'running' : 'done'
  const name = a.path.split('/').pop()
  const detail = { starting: 'Starting', running: `Claude is reading ${name}`, done: 'Answer ready' }[state]
  return { ...status, state, detail }
}

function id() {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${Math.random().toString(16).slice(2, 6)}`
}

function qr(): string[] {
  // a made-up 25 x 25 pattern with the three corner squares, enough to look right in screenshots
  const n = 25
  const rows = Array.from({ length: n }, (_, y) => Array.from({ length: n }, (_, x) => ((x * 7 + y * 13 + x * y) % 5) < 2))
  for (const [ox, oy] of [[0, 0], [n - 7, 0], [0, n - 7]]) {
    for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
      const edge = x === 0 || y === 0 || x === 6 || y === 6
      const core = x >= 2 && x <= 4 && y >= 2 && y <= 4
      rows[oy + y][ox + x] = edge || core
    }
  }
  return rows.map((r) => r.map((on) => (on ? '1' : '0')).join(''))
}

export const answers: Record<string, unknown> = {
  'code.ask_start': (p: { path: string; agent: string; kind: AskStatus['kind']; question?: string }) => {
    const a: Started = { id: id(), state: 'starting', kind: p.kind, agent: p.agent, path: p.path,
      started: Date.now() / 1000, detail: 'Starting', at: Date.now(), question: p.question ?? '', base: current(p.path) }
    asks[a.id] = a
    return now(a)
  },
  'code.ask_status': ({ id }: { id: string }) => now(asks[id]),
  'code.asks': () => Object.values(asks).map(now).reverse(),
  'code.ask_cancel': ({ id }: { id: string }) => {
    asks[id] = { ...asks[id], state: 'cancelled', detail: 'Stopped' }
    return asks[id]
  },
  'code.ask_result': ({ id }: { id: string }): AskResult & { put_back: string[]; state: string } =>
    ({ id, state: 'done', chat_id: '7f3c2a10-demo', put_back: [], ...answer(asks[id]) }),
  'terminals.send': () => null,
  'jobs.submit': () => ({ job_id: String(4240000 + Math.floor(Math.random() * 9999)) }),
  'pairing.make': () => {
    const matrix = qr()
    const n = matrix.length
    const path = matrix.flatMap((row, y) => [...row].map((c, x) => (c === '1' ? `M${x} ${y}h1v1h-1z` : ''))).join('')
    return {
      text: 'hpchub-pair:1:demo', matrix, clusters: ['Wulver (NJIT)', 'SDSC Expanse'], skipped: [],
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges">`
        + `<rect width="${n}" height="${n}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`,
      expires: Math.floor(Date.now() / 1000) + 600,
    }
  },
}
