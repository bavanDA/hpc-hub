import type { Link } from '../../types/terminals'

// copy: the button copies the code instead of opening the link
export type LinkBanner = { text: string; button: string; copy?: boolean }

export const mayHaveLinks = (text: string) => /https?:\/\/|pairing\s*code/i.test(text)

export function linkBanner(link: Link, copied: boolean): LinkBanner | null {
  switch (link.kind) {
    case 'tunnel': return { text: `VS Code is ready (tunnel ${link.tunnel})`, button: 'Open in browser' }
    case 'device-login':
      return { text: `Sign in with code ${link.code}${copied ? ' (copied)' : ''}`, button: 'Open sign-in page' }
    case 'remote': return { text: 'Remote control is on', button: 'Open' }
    case 'pair': return {
      text: `ChatGPT pairing code ${link.code}. In the ChatGPT app: Codex, connect a machine, enter the code.`,
      button: 'Copy code', copy: true }
    default: return null
  }
}
