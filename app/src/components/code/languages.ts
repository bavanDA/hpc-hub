// Which language a file is (by extension, file name or the #! line) and its CodeMirror support, loaded only when a
// file of that kind opens, so the editor starts small. Also how a file indents, so new lines match it.
import { indentUnit, StreamLanguage, type StreamParser } from '@codemirror/language'
import { EditorState, type Extension } from '@codemirror/state'

export type LangId = 'python' | 'c' | 'cpp' | 'cuda' | 'markdown' | 'json' | 'yaml' | 'shell' | 'slurm' | 'fortran'
  | 'julia' | 'r' | 'matlab' | 'latex' | 'bibtex' | 'toml' | 'cmake' | 'ipynb' | 'makefile' | 'plain'

export type Lang = {
  id: LangId
  name: string            // shown in the status line: "Python", "Slurm script"
  readOnlyReason?: string // set for files the editor only shows (notebooks)
}

const NAMES: Record<LangId, string> = {
  python: 'Python', c: 'C', cpp: 'C++', cuda: 'CUDA', markdown: 'Markdown', json: 'JSON', yaml: 'YAML',
  shell: 'Shell', slurm: 'Slurm script', fortran: 'Fortran', julia: 'Julia', r: 'R', matlab: 'MATLAB',
  latex: 'LaTeX', bibtex: 'BibTeX', toml: 'TOML', cmake: 'CMake', ipynb: 'Notebook', makefile: 'Makefile',
  plain: 'Text',
}

const BY_EXT: Record<string, LangId> = {
  py: 'python', pyw: 'python', pyi: 'python',
  c: 'c', h: 'c',
  cc: 'cpp', cpp: 'cpp', cxx: 'cpp', hpp: 'cpp', hh: 'cpp', hxx: 'cpp', ipp: 'cpp',
  cu: 'cuda', cuh: 'cuda',
  md: 'markdown', markdown: 'markdown', rmd: 'markdown', qmd: 'markdown',
  json: 'json', jsonc: 'json', geojson: 'json',
  yml: 'yaml', yaml: 'yaml', cff: 'yaml',
  sh: 'shell', bash: 'shell', zsh: 'shell', ksh: 'shell', csh: 'shell', tcsh: 'shell',
  slurm: 'slurm', sbatch: 'slurm', sub: 'slurm', pbs: 'slurm',
  f: 'fortran', for: 'fortran', f77: 'fortran', f90: 'fortran', f95: 'fortran', f03: 'fortran', f08: 'fortran',
  jl: 'julia',
  r: 'r',
  m: 'matlab',
  tex: 'latex', sty: 'latex', cls: 'latex', tikz: 'latex',
  bib: 'bibtex',
  toml: 'toml',
  cmake: 'cmake',
  ipynb: 'ipynb',
  mk: 'makefile',
}

const BY_NAME: Record<string, LangId> = {
  'cmakelists.txt': 'cmake', makefile: 'makefile', gnumakefile: 'makefile', '.bashrc': 'shell',
  '.bash_profile': 'shell', '.profile': 'shell', '.zshrc': 'shell', '.bash_aliases': 'shell', '.condarc': 'yaml',
  'environment.yml': 'yaml', 'pyproject.toml': 'toml', 'cargo.toml': 'toml', 'requirements.txt': 'plain',
}

/** The language of a file. text (or just its first lines) helps with scripts without an extension. */
export function detect(path: string, text = ''): Lang {
  const name = path.split('/').pop()!.toLowerCase()
  const ext = name.includes('.') ? name.split('.').pop()! : ''
  const head = text.slice(0, 4000)
  let id: LangId = BY_NAME[name] ?? BY_EXT[ext] ?? 'plain'
  if (id === 'plain' && head.startsWith('#!')) {
    const first = head.split('\n', 1)[0]
    if (/python/.test(first)) id = 'python'
    else if (/\b(ba|z|k|tc|c)?sh\b/.test(first)) id = 'shell'
    else if (/julia/.test(first)) id = 'julia'
    else if (/Rscript/.test(first)) id = 'r'
  }
  if (id === 'shell' && /^#SBATCH\b/m.test(head)) id = 'slurm'
  return { id, name: NAMES[id], ...(id === 'ipynb' ? { readOnlyReason: 'Notebooks open read-only here. Use VS Code to edit them.' } : {}) }
}

const legacy = (p: Promise<StreamParser<unknown>>) => p.then((parser) => StreamLanguage.define(parser) as Extension)

/** The highlighting and language features for a language, loaded on demand. Plain text has none. */
export async function loadLanguage(id: LangId): Promise<Extension> {
  switch (id) {
    case 'python': return (await import('@codemirror/lang-python')).python()
    case 'c': case 'cpp': case 'cuda': return (await import('@codemirror/lang-cpp')).cpp()
    case 'markdown': return (await import('@codemirror/lang-markdown')).markdown()
    case 'json': case 'ipynb': return (await import('@codemirror/lang-json')).json()
    case 'yaml': return (await import('@codemirror/lang-yaml')).yaml()
    case 'shell': case 'slurm': return legacy(import('@codemirror/legacy-modes/mode/shell').then((m) => m.shell))
    case 'fortran': return legacy(import('@codemirror/legacy-modes/mode/fortran').then((m) => m.fortran))
    case 'julia': return legacy(import('@codemirror/legacy-modes/mode/julia').then((m) => m.julia))
    case 'r': return legacy(import('@codemirror/legacy-modes/mode/r').then((m) => m.r))
    case 'matlab': return legacy(import('@codemirror/legacy-modes/mode/octave').then((m) => m.octave))
    case 'latex': case 'bibtex': return legacy(import('@codemirror/legacy-modes/mode/stex').then((m) => m.stex))
    case 'toml': return legacy(import('@codemirror/legacy-modes/mode/toml').then((m) => m.toml))
    case 'cmake': return legacy(import('@codemirror/legacy-modes/mode/cmake').then((m) => m.cmake))
    default: return []
  }
}

export type Indent = { tabs: boolean; size: number }

const DEFAULT_SIZE: Partial<Record<LangId, number>> = { python: 4, fortran: 2, julia: 4, r: 2, yaml: 2, json: 2,
  markdown: 2, shell: 2, slurm: 2, c: 4, cpp: 4, cuda: 4, matlab: 4, latex: 2, toml: 2, cmake: 2 }

/** How the file indents: tabs, or the most common step of spaces. Falls back to the language's usual style. */
export function detectIndent(text: string, id: LangId): Indent {
  if (id === 'makefile') return { tabs: true, size: 8 }
  let tabs = 0
  let spaces = 0
  const steps = new Map<number, number>()
  let prev = 0
  for (const line of text.slice(0, 200_000).split('\n')) {
    if (!line.trim()) continue
    if (line[0] === '\t') { tabs++; continue }
    const n = line.length - line.trimStart().length
    if (n > 0) spaces++
    const step = Math.abs(n - prev)
    if (step >= 2 && step <= 8) steps.set(step, (steps.get(step) ?? 0) + 1)
    prev = n
  }
  if (tabs > spaces) return { tabs: true, size: 4 }
  const best = [...steps.entries()].sort((a, b) => b[1] - a[1])[0]
  return { tabs: false, size: best ? best[0] : DEFAULT_SIZE[id] ?? 4 }
}

/** Editor settings for an indentation. */
export function indentExtension(indent: Indent): Extension {
  return [indentUnit.of(indent.tabs ? '\t' : ' '.repeat(indent.size)), EditorState.tabSize.of(indent.size)]
}
