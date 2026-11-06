import type { CompletionContext, CompletionResult } from '@codemirror/autocomplete'

export type Words = { labels: string[]; cites: string[] }

const COMMANDS = ['section{}', 'subsection{}', 'subsubsection{}', 'paragraph{}', 'begin{}', 'end{}', 'label{}',
  'ref{}', 'eqref{}', 'cite{}', 'citep{}', 'citet{}', 'emph{}', 'textbf{}', 'textit{}', 'texttt{}', 'item',
  'includegraphics[width=\\linewidth]{}', 'caption{}', 'centering', 'footnote{}', 'url{}', 'href{}{}', 'input{}',
  'include{}', 'frac{}{}', 'sqrt{}', 'sum', 'int', 'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'lambda', 'mu',
  'sigma', 'theta', 'mathbf{}', 'mathrm{}', 'mathcal{}', 'left(', 'right)', 'cdot', 'times', 'leq', 'geq', 'approx',
  'usepackage{}', 'documentclass{}', 'maketitle', 'tableofcontents', 'newpage', 'clearpage', 'bibliography{}',
  'bibliographystyle{}', 'hline', 'toprule', 'midrule', 'bottomrule', 'vspace{}', 'hspace{}', 'today']
const ENVS = ['equation', 'align', 'figure', 'table', 'tabular', 'itemize', 'enumerate', 'abstract', 'center',
  'description', 'verbatim', 'minipage', 'gather', 'split', 'cases', 'theorem', 'proof', 'lemma']

/** What goes inside \cmd{...}: citation keys, labels, environments, or nothing. */
export function argOptions(cmd: string, words: Words): string[] | null {
  return /cite/.test(cmd) ? words.cites : /ref$/.test(cmd) ? words.labels
    : cmd === 'begin' || cmd === 'end' ? ENVS : null
}

/** Commands after a backslash, and the argument of \cite, \ref and \begin (after the last comma). */
export function completions(words: () => Words) {
  return (ctx: CompletionContext): CompletionResult | null => {
    const arg = ctx.matchBefore(/\\(\w+)\{([^}]*)$/)
    if (arg) {
      const cmd = arg.text.match(/^\\(\w+)/)![1]
      const open = arg.text.indexOf('{') + 1
      const from = arg.from + open + arg.text.slice(open).lastIndexOf(',') + 1
      const list = argOptions(cmd, words())
      return list ? { from, options: list.map((label) => ({ label, type: 'variable' })) } : null
    }
    const word = ctx.matchBefore(/\\\w*/)
    if (!word || (word.from === word.to && !ctx.explicit)) return null
    return { from: word.from + 1, options: COMMANDS.map((c) => ({ label: c.replace(/[[{(].*$/, ''), detail: c,
      type: 'keyword' })), validFor: /^\w*$/ }
  }
}
