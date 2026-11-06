import type { BuildDone, Issue } from '../../types/latex'
import { basename, rel } from './bits'

export function counts(issues: Issue[]) {
  return { errors: issues.filter((i) => i.level === 'error').length,
    warnings: issues.filter((i) => i.level !== 'error').length }
}

const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`

/** The toast after a build; null when it was stopped. */
export function buildMessage(d: BuildDone): string | null {
  const { errors, warnings } = counts(d.issues)
  if (d.ok) return warnings ? `Compiled with ${plural(warnings, 'warning')}` : 'Compiled'
  if (d.stopped) return null
  return errors ? `Build failed with ${plural(errors, 'error')}` : 'Build failed, see the log'
}

/** The issues to show in the open file: those naming it, or those naming no file when it is the main file. */
export const issuesIn = (issues: Issue[], path: string, main: string) =>
  issues.filter((i) => i.file ? basename(path) === i.file : path === main)

/**
 * The project file an issue is about, relative to the folder. The log names a file as given to \input
 * ("results.tex" or "sections/results.tex"), so the open file wins over others with the same name.
 */
export function issueFile(i: Issue, files: string[], folder: string, main: string, open: string | null) {
  const same = (path: string) => path === i.file || path.endsWith(`/${i.file}`) || basename(path) === i.file
  if (!i.file) return rel(folder, main)
  if (open && same(rel(folder, open))) return rel(folder, open)
  return files.find(same)
}

export const bibKeys = (bib: string) => [...bib.matchAll(/@\w+\s*\{\s*([^,\s]+)\s*,/g)].map((m) => m[1])
export const labels = (tex: string) => [...tex.matchAll(/\\label\{([^}]+)\}/g)].map((m) => m[1])
