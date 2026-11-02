// Setting up the 6-digit codes a cluster like SDSC asks for (the desktop's AuthenticatorHelp), on the phone: the
// steps, and a button that opens the cluster's page where you add the code.
import { ExternalLink } from 'lucide-react'

import { openSystem } from '@shared/components/app/openLink'
import { who } from '@shared/components/clusters/loginCopy'
import type { Cluster } from '@shared/types/clusters'
import { List, MainButton, Section, Sheet, useToast } from '../ui'

function host(url: string) {
  try { return new URL(url).hostname } catch { return url }
}

export function AuthenticatorSheet({ cluster: c, onClose }: { cluster: Cluster; onClose: () => void }) {
  const toast = useToast()
  const url = c.code_setup ?? ''
  const site = host(url)
  const signIn = site.endsWith('sdsc.edu')
    ? 'Choose Log In Using Globus, then ACCESS CI, and sign in with your ACCESS login.'
    : 'Sign in with the account you use for this cluster.'
  const steps: [string, string][] = [
    ['Install an authenticator app', 'Google Authenticator from Google Play. Microsoft Authenticator or Authy work too.'],
    [url ? `Open ${site}` : "Open your cluster's account page", signIn],
    ['Tap Manage 2FA and add the code', 'In the authenticator: tap +, then Scan a QR code, or enter the setup key it shows.'],
    ['Wait up to 15 minutes', `${who(c)} takes a while to learn your new code.`],
    ['Connect in HPC Hub', 'When it asks, type the code. It goes as soon as you type 6 digits.'],
  ]
  const tips: [string, string][] = [
    ['Wait for a fresh code', 'Codes last 30 seconds. Type one that just appeared.'],
    ["Check your phone's clock", 'Date and time must be set automatically, or every code is wrong.'],
    ["Don't guess", 'A few wrong codes can lock your account.'],
  ]
  const line = (title: string, sub: string, n?: number) => (
    <div key={title} className="flex gap-3 border-b border-line px-4 py-3">
      {n && <span className="w-5 shrink-0 font-semibold text-dim tabular-nums">{n}</span>}
      <span className="min-w-0 flex-1 break-words"><span className="block font-medium">{title}</span>
        <span className="block text-sm text-dim">{sub}</span></span>
    </div>
  )
  return (
    <Sheet title="Authenticator app" onClose={onClose} flush
      actions={url && <MainButton icon={ExternalLink}
        onClick={() => openSystem(url).catch((e) => toast(String(e)))}>Open {site}</MainButton>}>
      <p className="px-4 pb-5">{c.name} asks for a 6-digit code at every sign-in. You set this up once.</p>
      <List>{steps.map(([title, sub], i) => line(title, sub, i + 1))}</List>
      <Section title="When a code doesn't work">{tips.map(([title, sub]) => line(title, sub))}</Section>
    </Sheet>
  )
}
