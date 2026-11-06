import { describe, expect, it } from 'vitest'

import { plain, type Block } from '../model'
import { fromBib } from './bib'
import { loadLatex } from './load'
import { mathFor } from './math'
import { stripComments } from './scan'

const files: Record<string, string> = {
  'p/main.tex': String.raw`\documentclass{article}
\newcommand{\R}{\mathbb{R}}
\title{A Small Paper}
\author{Jane Doe}
\begin{document}
\maketitle
\begin{abstract}We look at things.\end{abstract}
\section{Intro}\label{sec:intro}
Some \emph{text} with $x \in \R$ % a comment
and a cite \cite{knuth}.
\input{more}
\begin{equation}a = b\label{eq:one}\end{equation}
See Section~\ref{sec:intro} and \eqref{eq:one}.
\bibliography{refs}
\end{document}`,
  'p/more.tex': String.raw`\subsection{Details}
\begin{itemize}\item One \item Two\end{itemize}`,
  'p/refs.bib': '@book{knuth, author = {Donald Knuth}, title = {The Art}, year = {1968}, publisher = {AW}}',
}
const read = async (p: string) => {
  if (p in files) return files[p]
  throw new Error(`no ${p}`)
}

describe('loadLatex', async () => {
  const doc = await loadLatex(read, 'p/main.tex')
  const kinds = doc.blocks.map((b) => b.t)

  it('reads the blocks in order, with the \\input file in place', () =>
    expect(kinds).toEqual(['title', 'box', 'h', 'p', 'h', 'list', 'math', 'p', 'h', 'refs']))

  it('takes the title and the author', () => {
    const title = doc.blocks[0] as Extract<Block, { t: 'title' }>
    expect(plain(title.c)).toBe('A Small Paper')
    expect(plain(title.by)).toBe('Jane Doe')
  })

  it('numbers sections and subsections', () => {
    const heads = doc.blocks.filter((b) => b.t === 'h').map((b) => [b.num, plain(b.c)])
    expect(heads).toEqual([['1', 'Intro'], ['1.1', 'Details'], ['', 'References']])
  })

  it('keeps inline math and drops comments', () => {
    const p = doc.blocks[3] as Extract<Block, { t: 'p' }>
    expect(p.c).toContainEqual({ t: 'math', tex: 'x \\in \\R' })
    expect(plain(p.c)).not.toContain('comment')
  })

  it('numbers equations and knows the labels', () => {
    expect(doc.blocks[6]).toMatchObject({ t: 'math', tex: 'a = b', tags: ['1'] })
    expect(doc.labels).toEqual({ 'sec:intro': { num: '1', kind: 'Section' }, 'eq:one': { num: '1', kind: 'Equation' } })
  })

  it('cites from the .bib file', () => {
    expect(doc.cites).toEqual({ knuth: '1' })
    expect(doc.blocks.at(-1)).toMatchObject({ t: 'refs', items: [{ key: 'knuth', label: '1' }] })
  })

  it('keeps the macros for KaTeX', () => expect(doc.macros['\\R']).toBe('\\mathbb{R}'))
})

describe('fromBib', () => {
  it('writes an entry as Authors. Title. Publisher, year.', () => {
    expect(fromBib([files['p/refs.bib']], ['knuth']))
      .toEqual([{ key: 'knuth', label: '1', text: 'Donald Knuth. The Art. AW, 1968.' }])
  })
  it('leaves out entries never cited', () => expect(fromBib([files['p/refs.bib']], [])).toEqual([]))
})

describe('stripComments', () => {
  it('drops comments and comment lines but keeps \\%', () =>
    expect(stripComments('a % b\n% whole\nc \\% d')).toBe('a \nc \\% d'))
})

describe('mathFor', () => {
  it('puts in numbers for references and drops labels', () => {
    const labels = { 'eq:one': { num: '1', kind: 'Equation' } }
    expect(mathFor('x \\label{eq:one} = \\eqref{eq:one} + \\ref{nope}', labels)).toBe('x  = \\text{(1)} + \\text{??}')
  })
})
