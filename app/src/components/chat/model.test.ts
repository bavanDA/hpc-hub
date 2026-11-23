import { describe, expect, it } from 'vitest'

import { blocks, cells, describe as describeTool, toolHolds, diff, inline, items, needsTerminal, shortPath, starting, type ChatEvent, type Screen } from './model'

describe('the chat as items', () => {
  const events: ChatEvent[] = [
    { kind: 'user', id: 'u1', text: 'Why did k=80 fail?' },
    { kind: 'text', id: 'a1', text: "I'll look at the log." },
    { kind: 'tool', id: 'toolu_1', name: 'Read', input: { file_path: '/home/jdoe/proj/logs/run.out' } },
    { kind: 'result', id: 'r1', tool: 'toolu_1', text: 'oom_kill', error: false },
    { kind: 'tool', id: 'toolu_2', name: 'Bash', input: { command: 'sbatch job.sh', description: 'Submit it' } },
  ]

  it('folds each result into its tool card, paths short inside the chat folder', () => {
    const got = items(events, '/home/jdoe/proj')
    expect(got.map((i) => i.kind)).toEqual(['user', 'text', 'tool', 'tool'])
    const read = got[2] as Extract<typeof got[number], { kind: 'tool' }>
    expect([read.verb, read.target, read.result]).toEqual(['Read', 'logs/run.out', 'oom_kill'])
    const ran = got[3] as Extract<typeof got[number], { kind: 'tool' }>
    expect([ran.verb, ran.target, ran.detail, ran.result]).toEqual(['Ran', 'sbatch job.sh', 'Submit it', null])
  })

  it('an edit is a before and after with a little around it', () => {
    expect(diff('a\nb\n#SBATCH --mem=32G\nc', 'a\nb\n#SBATCH --mem=50G\nc')).toEqual([
      { kind: 'same', text: 'a' }, { kind: 'same', text: 'b' },
      { kind: 'del', text: '#SBATCH --mem=32G' }, { kind: 'add', text: '#SBATCH --mem=50G' },
      { kind: 'same', text: 'c' },
    ])
  })

  it('a to-do list keeps each step and its state', () => {
    const t = describeTool('TodoWrite', { todos: [{ content: 'Find why', status: 'completed' },
      { content: 'Resubmit', status: 'in_progress' }, { content: 'Odd', status: 'weird' }] })
    expect(t.todos).toEqual([{ text: 'Find why', status: 'completed' }, { text: 'Resubmit', status: 'in_progress' },
      { text: 'Odd', status: 'pending' }])
  })

  it('paths outside the folder stay whole', () => {
    expect(shortPath('/scratch/jdoe/x', '/home/jdoe/proj')).toBe('/scratch/jdoe/x')
  })
})

describe('text', () => {
  it('splits code fences from prose', () => {
    expect(blocks('Run this:\n```bash\nsbatch job.sh\n```\nThen wait.')).toEqual([
      { code: false, text: 'Run this:' }, { code: true, text: 'sbatch job.sh' }, { code: false, text: 'Then wait.' }])
  })

  it('bold and code inside a line, the rest plain', () => {
    expect(inline('Ask for **50 GB**, not `--mem=32G`.')).toEqual([
      { kind: 'plain', text: 'Ask for ' }, { kind: 'bold', text: '50 GB' }, { kind: 'plain', text: ', not ' },
      { kind: 'code', text: '--mem=32G' }, { kind: 'plain', text: '.' }])
  })

  it('markup in what Claude wrote stays text', () => {
    expect(inline('<img src=x onerror=alert(1)>')).toEqual([{ kind: 'plain', text: '<img src=x onerror=alert(1)>' }])
  })
})

describe('commands', () => {
  it('a command with a menu of its own goes to the terminal', () => {
    expect(needsTerminal('/model')).toBe(true)
    expect(needsTerminal('/model opus')).toBe(false)
    expect(needsTerminal('/compact')).toBe(false)
    expect(needsTerminal('/agents')).toBe(true)
    expect(needsTerminal('fix the plot')).toBe(false)
  })
})

describe('tables and headings in what Claude writes', () => {
  // 2026-11-18: a status table showed as raw | pipes in the chat view (owner's screenshot)
  it('a table becomes a header and rows, between its paragraphs', () => {
    const text = 'Partly. Here is the state:\n\n| | status |\n|---|---|\n| **main agent** | paused, waiting |\n| Slurm jobs | only your `hpc-hub` job |\n\nSo nothing runs.'
    const b = blocks(text)
    expect(b.map((x) => x.table ? 'table' : x.text)).toEqual(['Partly. Here is the state:', 'table', 'So nothing runs.'])
    expect(b[1].table).toEqual({ head: ['', 'status'],
      rows: [['**main agent**', 'paused, waiting'], ['Slurm jobs', 'only your `hpc-hub` job']] })
  })
  it('a | inside code or escaped stays in its cell, and short rows are filled', () => {
    expect(cells('| `a|b` | c \\| d |')).toEqual(['`a|b`', 'c | d'])
    expect(blocks('| a | b | c |\n|:--|--:|---|\n| 1 |')[0].table?.rows).toEqual([['1', '', '']])
  })
  it('pipes without a rule line are just text, and headings are found', () => {
    expect(blocks('a | b | c')[0].table).toBeUndefined()
    expect(blocks('## Next steps\nRun it.')).toEqual([{ code: false, text: 'Next steps', heading: 2 }, { code: false, text: 'Run it.' }])
  })
})

describe('finding in the chat', () => {
  it('a folded tool card opens when what you look for is inside it', () => {
    const card = { detail: '', result: 'slurmstepd: error: Detected 1 oom_kill event', diff: [{ text: '#SBATCH --mem=32G' }] }
    expect(toolHolds(card, 'OOM_KILL')).toBe(true)  // any case
    expect(toolHolds(card, '--mem=32')).toBe(true)  // in the diff too
    expect(toolHolds(card, 'gpu')).toBe(false)
    expect(toolHolds(card, '  ')).toBe(false)
    expect(toolHolds({ result: null }, 'x')).toBe(false)  // still running: nothing yet
  })
})

describe('links in what Claude writes', () => {
  // 2026-11-18: links in the chat view didn't open, and copying from it was hard (owner's report)
  it('a bare link is a link, without the full stop after it', () => {
    expect(inline('See https://example.edu/docs.')).toEqual([
      { kind: 'plain', text: 'See ' }, { kind: 'link', text: 'https://example.edu/docs', url: 'https://example.edu/docs' },
      { kind: 'plain', text: '.' }])
  })
  it('a Markdown link shows its words and opens its address', () => {
    expect(inline('Read [the guide](https://example.edu/guide) first')).toEqual([
      { kind: 'plain', text: 'Read ' }, { kind: 'link', text: 'the guide', url: 'https://example.edu/guide' },
      { kind: 'plain', text: ' first' }])
  })
  it('a link in parentheses or with a query keeps exactly its address', () => {
    expect(inline('(https://example.edu/a?x=1&y=2)')[1]).toEqual(
      { kind: 'link', text: 'https://example.edu/a?x=1&y=2', url: 'https://example.edu/a?x=1&y=2' })
  })
  it('a link inside code stays code, and only http(s) links count', () => {
    expect(inline('`curl https://example.edu`')).toEqual([{ kind: 'code', text: 'curl https://example.edu' }])
    expect(inline('[x](javascript:alert(1)) file:///etc/passwd').every((p) => p.kind !== 'link')).toBe(true)
  })
  it('several links, bold and code in one line keep their order', () => {
    expect(inline('**Job** `1606` at https://a.example and https://b.example').map((p) => p.kind))
      .toEqual(['bold', 'plain', 'code', 'plain', 'link', 'plain', 'link'])
  })
  it('links work inside table cells and headings too', () => {
    const b = blocks('| job | log |\n|---|---|\n| 1606 | https://example.edu/log |')
    expect(inline(b[0].table!.rows[0][1])[0]).toMatchObject({ kind: 'link', url: 'https://example.edu/log' })
  })
})

describe('starting', () => {
  const s = (over: Partial<Screen>): Screen => ({ busy: false, mode: 'ask', ask: null, ...over })
  it('only while Claude has no input box and nothing waits on you', () => {
    expect(starting(s({ ready: false }))).toBe(true)
    expect(starting(s({ ready: true }))).toBe(false)
    expect(starting(s({}))).toBe(false)  // an older backend that doesn't say: never stuck on "starting"
    expect(starting(s({ ready: false, ask: { question: 'Trust this folder?', detail: '', options: [], permission: false } })))
      .toBe(false)  // the trust question comes first: answer it
    expect(starting(s({ ready: false, gone: true }))).toBe(false)
    expect(starting(null)).toBe(false)
  })
})

describe('a message Claude gave back (2026-11-22 report)', () => {
  const ev = [{ kind: 'user' as const, id: 'u1', text: 'fix the plot' }, { kind: 'text' as const, id: 'a1', text: 'Done.' },
    { kind: 'user' as const, id: 'u2', text: 'and the labels\n' }]
  it('is left out only when it is the last message and the very text in the box', () => {
    expect(items(ev, '', 'and the labels').map((i) => i.id)).toEqual(['u1', 'a1'])
    expect(items(ev, '', 'fix the plot').map((i) => i.id)).toEqual(['u1', 'a1', 'u2'])  // not the last one
    expect(items(ev, '').map((i) => i.id)).toEqual(['u1', 'a1', 'u2'])
    expect(items(ev.slice(0, 2), '', 'Done.').map((i) => i.id)).toEqual(['u1', 'a1'])  // never Claude's reply
  })
})
