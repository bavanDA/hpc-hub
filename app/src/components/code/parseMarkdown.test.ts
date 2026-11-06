import { describe, expect, it } from 'vitest'

import { parseMarkdown } from './parseMarkdown'

describe('parseMarkdown', () => {
  it('reads headings, paragraphs, lists, quotes and code', () => {
    const md = [
      '# Title', '', 'Some text', 'on two lines.', '', '- one', '- two', '  more of two', '', '1. first', '2) second',
      '', '> a quote', '> goes on', '', '```py', 'x = 1', '```', 'after',
    ].join('\n')
    expect(parseMarkdown(md)).toEqual([
      { kind: 'heading', level: 1, text: 'Title' },
      { kind: 'para', text: 'Some text on two lines.' },
      { kind: 'list', ordered: false, items: ['one', 'two more of two'] },
      { kind: 'list', ordered: true, items: ['first', 'second'] },
      { kind: 'quote', text: 'a quote goes on' },
      { kind: 'code', lang: 'py', text: 'x = 1' },
      { kind: 'para', text: 'after' },
    ])
  })

  it('keeps an unclosed code block to the end', () =>
    expect(parseMarkdown('~~~\na\nb')).toEqual([{ kind: 'code', lang: '', text: 'a\nb' }]))

  it('handles Windows line ends', () =>
    expect(parseMarkdown('## Hi\r\ntext')).toEqual([{ kind: 'heading', level: 2, text: 'Hi' }, { kind: 'para', text: 'text' }]))
})
