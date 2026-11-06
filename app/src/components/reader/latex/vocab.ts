export type Theorem = { title: string; counter: string; within: string; numbered: boolean }
export type Macro = { args: number; def: string | null; body: string }

export const THEOREMS = ['theorem', 'lemma', 'corollary', 'proposition', 'definition', 'remark', 'example', 'claim',
  'conjecture', 'assumption', 'fact', 'observation', 'problem', 'question', 'exercise', 'notation', 'hypothesis']
export const DISPLAY = ['equation', 'align', 'gather', 'multline', 'eqnarray', 'alignat', 'flalign', 'displaymath', 'math']
export const SKIP_ENVS = ['tikzpicture', 'picture', 'tabular', 'tabularx', 'tabular*', 'longtable', 'comment', 'filecontents',
  'filecontents*', 'thebibliography', 'titlepage']
export const LISTS = ['itemize', 'enumerate', 'description', 'compactitem', 'compactenum', 'inparaenum', 'enumerate*']
export const FLOATS: Record<string, string> = { figure: 'Figure', 'figure*': 'Figure', table: 'Table', 'table*': 'Table',
  algorithm: 'Algorithm', 'algorithm*': 'Algorithm', wrapfigure: 'Figure', listing: 'Listing' }
export const CODE = ['verbatim', 'verbatim*', 'lstlisting', 'minted', 'Verbatim', 'alltt']
/** Commands whose arguments are not text: how many groups to skip. */
export const SKIP: Record<string, number> = {
  label: 1, vspace: 1, hspace: 1, includegraphics: 1, bibliographystyle: 1, pagestyle: 1, thispagestyle: 1,
  hypersetup: 1, graphicspath: 1, linespread: 1, color: 1, captionsetup: 1, sisetup: 1, theoremstyle: 1, nocite: 1,
  index: 1, markright: 1, enlargethispage: 1, setlist: 1, usetikzlibrary: 1, tikzset: 1, pgfplotsset: 1,
  mathtoolsset: 1, geometry: 1, vskip: 0, setlength: 2, addtolength: 2, setcounter: 2, addtocounter: 2,
  numberwithin: 2, markboth: 2, definecolor: 3, addcontentsline: 3, newenvironment: 3, renewenvironment: 3,
  crefname: 3, Crefname: 3, newcommand: 2, renewcommand: 2, providecommand: 2, DeclareMathOperator: 2,
  DeclarePairedDelimiter: 3, newtheorem: 2, input: 1, include: 1, usepackage: 1, documentclass: 1, title: 1,
  author: 1, date: 1, thanks: 1, keywords: 0, newpage: 0, clearpage: 0, cleardoublepage: 0, tableofcontents: 0,
  listoffigures: 0, listoftables: 0, noindent: 0, centering: 0, raggedright: 0, raggedleft: 0, par: 0, indent: 0,
  smallskip: 0, medskip: 0, bigskip: 0, hfill: 0, vfill: 0, null: 0, protect: 0, footnotesize: 0, small: 0,
  normalsize: 0, large: 0, Large: 0, LARGE: 0, huge: 0, Huge: 0, scriptsize: 0, tiny: 0, maketitle: 0, appendix: 0,
  phantomsection: 0, frontmatter: 0, mainmatter: 0, backmatter: 0, linebreak: 0, pagebreak: 0, nolinebreak: 0,
  allowbreak: 0, sloppy: 0, onecolumn: 0, twocolumn: 0, balance: 0, selectfont: 0, normalfont: 0, rmfamily: 0,
  sffamily: 0, bibliography: 1, printbibliography: 0, addbibresource: 1, textcolor: 1, colorbox: 1,
}
export const WORDS: Record<string, string> = {
  LaTeX: 'LaTeX', TeX: 'TeX', ldots: '…', dots: '…', textellipsis: '…', today: '', ss: 'ß', o: 'ø', O: 'Ø',
  ae: 'æ', AE: 'Æ', oe: 'œ', OE: 'Œ', aa: 'å', AA: 'Å', l: 'ł', L: 'Ł', i: 'ı', j: 'ȷ', textendash: '–',
  textemdash: '—', textquoteleft: '‘', textquoteright: '’', textbullet: '•', textasciitilde: '~', S: '§', P: '¶',
  copyright: '©', textregistered: '®', texttrademark: '™', textdegree: '°', quad: ' ', qquad: '  ', enspace: ' ',
  thinspace: ' ', textbackslash: '\\', textbar: '|', textless: '<', textgreater: '>', eg: 'e.g.', ie: 'i.e.',
  etal: 'et al.', etc: 'etc.', vs: 'vs.', cf: 'cf.', wrt: 'w.r.t.',
}
export const ACCENTS: Record<string, string> = { "'": '́', '`': '̀', '^': '̂', '"': '̈', '~': '̃',
  '=': '̄', '.': '̇', c: '̧', v: '̌', u: '̆', H: '̋', k: '̨', r: '̊',
  d: '̣', b: '̱' }
export const STYLES: Record<string, 'em' | 'b' | 'code' | 'sc' | ''> = { emph: 'em', textit: 'em', textsl: 'em', mathit: 'em',
  textbf: 'b', mathbf: 'b', texttt: 'code', url: 'code', path: 'code', textsc: 'sc', textrm: '', textsf: '',
  textnormal: '', textup: '', text: '', mbox: '', hbox: '', underline: 'em', uline: 'em', textmd: '', fbox: '',
  makebox: '', framebox: '', mathrm: '', ensuremath: '', NoCaseChange: '' }
export const DECLARED: Record<string, 'em' | 'b' | 'code' | 'sc'> = { em: 'em', it: 'em', itshape: 'em', sl: 'em',
  slshape: 'em', bf: 'b', bfseries: 'b', tt: 'code', ttfamily: 'code', sc: 'sc', scshape: 'sc' }
export const CITES = /^(cite|citep|citet|citealp|citealt|parencite|textcite|autocite|footcite|citeyear|citeauthor|Cite|Citep|Citet|supercite|smartcite|cites)$/
export const REFS: Record<string, 'ref' | 'eq' | 'named'> = { ref: 'ref', pageref: 'ref', nameref: 'ref', eqref: 'eq',
  autoref: 'named', cref: 'named', Cref: 'named', vref: 'named', Vref: 'named', subref: 'ref', labelcref: 'ref' }

export const letters = (n: number) => { let s = ''; for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s; return s }
