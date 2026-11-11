import { describe, expect, it } from 'vitest'

import { ANSI_DARK, parseRows, stripped } from './sgr'

describe('parseRows', () => {
  it('splits text from its colors', () => {
    const [row] = parseRows(['\x1b[31mred\x1b[0m plain'], ANSI_DARK)
    expect(row.plain).toBe('red plain')
    expect(row.spans[0]).toEqual({ text: 'red', style: { color: ANSI_DARK[1] } })
    expect(row.spans[1]).toEqual({ text: ' plain', style: undefined })
  })

  it('carries a style from one line to the next, as tmux leaves it', () => {
    const rows = parseRows(['\x1b[1m\x1b[32mstart', 'still green\x1b[0m'], ANSI_DARK)
    expect(rows[1].spans[0].style).toMatchObject({ fontWeight: 700, color: ANSI_DARK[2] })
  })

  it('reads 256 and true colors and drops other control sequences', () => {
    const [a, b] = parseRows(['\x1b[38;5;208morange', '\x1b[38;2;10;20;30mcustom\x1b[0m\x1b[H\x07'], ANSI_DARK)
    expect(a.spans[0].style?.color).toBe('rgb(255,135,0)')
    expect(b.spans[0].style?.color).toBe('rgb(10,20,30)')
    expect(b.plain).toBe('custom')
  })
})

describe('stripped', () => {
  it('leaves the plain text of a colored line', () => {
    expect(stripped('\x1b[1;32mjdoe@login1\x1b[0m:~$ ')).toBe('jdoe@login1:~$ ')
  })
})
