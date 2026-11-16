import type { Link } from '../../types/terminals'

// copy: the button copies the code instead of opening the link; forward: it brings a page on the cluster here first;
// file: it brings an .html file (and what it uses) here and opens it
export type LinkBanner = { text: string; button: string; copy?: boolean; forward?: boolean; file?: boolean }

export const mayHaveLinks = (text: string) => /https?:\/\/|pairing\s*code|\.html?\b/i.test(text)

export function linkBanner(link: Link, copied: boolean, where = ''): LinkBanner | null {
  switch (link.kind) {
    case 'tunnel': return { text: `VS Code is ready (tunnel ${link.tunnel})`, button: 'Open in browser' }
    case 'device-login':
      return { text: `Sign in with code ${link.code}${copied ? ' (copied)' : ''}`, button: 'Open sign-in page' }
    case 'remote': return { text: 'Remote control is on', button: 'Open' }
    case 'local-web': return {  // Jupyter, TensorBoard, a website's dev server...: open it in this computer's browser
      text: `A web page is running on ${where || 'the cluster'}${link.port ? `:${link.port}` : ''}`,
      button: 'Open on this computer', forward: true }
    case 'pair': return {
      text: `ChatGPT pairing code ${link.code}. In the ChatGPT app: Codex, connect a machine, enter the code.`,
      button: 'Copy code', copy: true }
    case 'page': return { text: `Web page ${pageName(link.url)}`, button: 'Open in browser', file: true }
    default: return null
  }
}

/** The same page named twice (docs/r.html, then /scratch/me/proj/docs/r.html) is one banner. It opens the path that
 * says the most: a full one over a relative one, then the longer. */
export function betterPagePath(known: string, next: string): string {
  const rank = (p: string) => (p.startsWith('/') || p.startsWith('~/') ? 2 : 1)
  if (rank(next) !== rank(known)) return rank(next) > rank(known) ? next : known
  return next.length > known.length ? next : known
}

export const pageName = (path: string) => path.split('/').pop() ?? path
