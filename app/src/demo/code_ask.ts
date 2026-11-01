// Demo answers for asking an agent about code (code_ask.py), sending text into a session, submitting a job script
// and the phone's QR code. An ask "runs" for a few seconds, then answers with one changed file and one new test.
import type { AskResult, AskStatus } from '../types/code'

type Started = AskStatus & { at: number }
const asks: Record<string, Started> = {}

const ORIGINAL = `import numpy as np

def train(data, lr=0.1, epochs=10):
    w = np.zeros(data.shape[1])
    for _ in range(epochs):
        grad = data.T @ (data @ w) / len(data)
        w -= lr * grad
    return w
`
const PROPOSED = ORIGINAL.replace('lr=0.1', 'lr=0.01').replace('    return w', '    if not np.isfinite(w).all():\n        raise ValueError("training diverged, try a smaller lr")\n    return w')

function now(a: Started): AskStatus {
  const s = (Date.now() - a.at) / 1000
  if (a.state === 'cancelled') return a
  const state = s < 1.5 ? 'starting' : s < 4 ? 'running' : 'done'
  const name = a.path.split('/').pop()
  const detail = { starting: 'Starting', running: `Claude is reading ${name}`, done: 'Answer ready' }[state]
  return { ...a, state, detail }
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
  'code.ask_start': (p: { path: string; agent: string; kind: AskStatus['kind'] }) => {
    const a: Started = { id: id(), state: 'starting', kind: p.kind, agent: p.agent, path: p.path,
      started: Date.now() / 1000, detail: 'Starting', at: Date.now() }
    asks[a.id] = a
    return now(a)
  },
  'code.ask_status': ({ id }: { id: string }) => now(asks[id]),
  'code.asks': () => Object.values(asks).map(now).reverse(),
  'code.ask_cancel': ({ id }: { id: string }) => {
    asks[id] = { ...asks[id], state: 'cancelled', detail: 'Stopped' }
    return asks[id]
  },
  'code.ask_result': ({ id }: { id: string }): AskResult & { put_back: string[]; state: string } => {
    const path = asks[id]?.path ?? '/home/jdoe/proj/train.py'
    const folder = path.slice(0, path.lastIndexOf('/'))
    return {
      id, state: 'done', chat_id: '7f3c2a10-demo', put_back: [],
      answer: 'The loss blows up because the learning rate is too big for this data.\n\n'
        + '- Lowered `lr` from 0.1 to 0.01.\n- `train` now stops with a clear error if the weights stop being numbers.\n\n'
        + 'I also wrote a small test that checks training stays finite.',
      files: [
        { path, base_sha: 'demo', original: ORIGINAL, proposed: PROPOSED, is_new: false },
        { path: `${folder}/tests/test_train.py`, base_sha: '', original: '', is_new: true,
          proposed: 'import numpy as np\nfrom train import train\n\n\ndef test_training_stays_finite():\n'
            + '    data = np.random.default_rng(0).normal(size=(100, 4))\n    assert np.isfinite(train(data)).all()\n' },
      ],
    }
  },
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
