// 2026-11-25, owner: "can add download pdf option as well". The built PDF comes to this computer, into
// Downloads/HPC Hub/<cluster> like the files Files opens, never over one already there.
import { basename } from './bits'

/** What the paper is called here: thesis.pdf for thesis/main.tex ("main" says nothing about the paper), else the
 *  main file's own name, as latexmk names the PDF: paper.tex gives paper.pdf. */
export function pdfName(folder: string, main: string): string {
  const stem = basename(main).replace(/\.tex$/i, '')
  const project = folder.replace(/\/+$/, '') ? basename(folder) : ''
  return `${(stem.toLowerCase() === 'main' && project) || stem || 'paper'}.pdf`
}

export type DownloadState = { ok: boolean; why: string }  // why: the button's title, or why it cannot

/** Whether the PDF can be downloaded now: there is a built one, and no build is writing it. */
export function downloadState(pdf: { path?: string; none?: boolean; error?: string }, running: boolean): DownloadState {
  if (running) return { ok: false, why: 'Compiling: download the PDF when the build ends' }
  if (pdf.path) return { ok: true, why: 'Download the PDF to this computer' }
  if (pdf.none) return { ok: false, why: 'No PDF yet: press Recompile to build it first' }
  if (pdf.error) return { ok: false, why: `Could not read the PDF: ${pdf.error}` }
  return { ok: false, why: 'Looking for the PDF…' }
}

/** The last part of a path on this computer: Windows paths use \. */
export const fileOf = (p: string) => p.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || p

/** "Saved thesis.pdf to C:\Users\jdoe\Downloads\HPC Hub\wulver": the file, then its folder. */
export function savedMessage(path: string): string {
  const name = fileOf(path)
  const dir = path.replace(/[\\/]+$/, '').slice(0, -name.length).replace(/[\\/]+$/, '')
  return dir ? `Saved ${name} to ${dir}` : `Saved ${name}`
}
