// The report as the review window shows it (ReportDialog.tsx): the fields report.preview gave, the note, the email.

export type Preview = { kind: 'error' | 'user'; error: string; log: string; page: string; app: string; platform: string
  os: string }

const PLATFORMS: Record<string, string> = { linux: 'Linux', windows: 'Windows', macos: 'macOS', android: 'Android' }

/** The report as plain text, the way the window shows it. */
export function reportText(p: Preview, note: string, contact: string): string {
  const parts = [`HPC Hub ${p.app} on ${PLATFORMS[p.platform] ?? p.platform}, ${p.os}`
    + (p.page ? `\nPage: ${p.page}` : '')]
  if (p.error) parts.push(`Error\n${p.error}`)
  if (note.trim()) parts.push(`Your note\n${note.trim()}`)
  if (contact.trim()) parts.push(`Your email\n${contact.trim()}`)
  if (p.log) parts.push(`Recent log\n${p.log}`)
  return parts.join('\n\n')
}
