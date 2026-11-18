import { describe, expect, it } from 'vitest'

import { blocks, describe as describeTool, diff, inline, items, needsTerminal, shortPath, type ChatEvent } from './model'

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
