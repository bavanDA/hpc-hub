import { describe, expect, it } from 'vitest'

import type { Block } from './model'
import { fromPdf, pageWords, place, type PdfText } from './pdftext'

const line = (y: number, text: string, size = 10, x0 = 72, x1 = 540) =>
  ({ page: 1, x0, x1, y, top: y - size, bottom: y + 2, size, text, math: 0, bold: false, tag: '', tagX: 0 })

const text: PdfText = {
  pages: [[
    line(100, 'Big Title', 20, 200, 400),
    line(200, '1 Introduction', 14),
    line(230, 'This is the first line of a paragraph that goes on'),
    line(242, 'and ends here.', 10, 72, 300),
    line(270, 'A second paragraph starts here and it is long enough'),
    line(282, 'to wrap.', 10, 72, 200),
  ]],
  heights: [792], body: 10, count: 1,
}

describe('fromPdf', () => {
  it('finds the title, a numbered heading and two paragraphs', () => {
    expect(fromPdf(text).blocks).toEqual([
      { t: 'title', c: [{ t: 'text', s: 'Big Title' }], by: [], page: 1 },
      { t: 'h', level: 1, num: '1', c: [{ t: 'text', s: 'Introduction' }], page: 1 },
      { t: 'p', c: [{ t: 'text', s: 'This is the first line of a paragraph that goes on and ends here.' }], page: 1 },
      { t: 'p', c: [{ t: 'text', s: 'A second paragraph starts here and it is long enough to wrap.' }], page: 1 },
    ])
  })
})

describe('pageWords', () => {
  it('squeezes each page to lower-case letters and digits', () =>
    expect(pageWords({ ...text, pages: [[line(1, 'Hello, World 2!')]] })).toEqual(['helloworld2']))
})

describe('place', () => {
  it('puts each block on the page its first words are on', () => {
    const blocks: Block[] = [
      { t: 'h', level: 1, num: '1', c: [{ t: 'text', s: 'Intro' }] },
      { t: 'p', c: [{ t: 'text', s: 'Some text with words' }] },
      { t: 'h', level: 2, num: '1.1', c: [{ t: 'text', s: 'Details' }] },
      { t: 'code', s: 'x = 1' },
    ]
    place(blocks, ['1introsometextwithwords', '11detailsxequals1'])
    expect(blocks.map((b) => b.page)).toEqual([1, 1, 2, 2])
  })
})
