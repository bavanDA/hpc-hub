// Setting up the 6-digit codes a cluster like SDSC asks for (the desktop's AuthenticatorHelp), on the phone: the
// steps, and a button that opens the cluster's page where you add the code.
import { ExternalLink } from 'lucide-react'

import { openSystem } from '@shared/components/app/openLink'
import type { Cluster } from '@shared/types/clusters'
import { Button, Sheet, useToast } from '../ui'

function host(url: string) {
  try { return new URL(url).hostname } catch { return url }
}

export function AuthenticatorSheet({ cluster: c, onClose }: { cluster: Cluster; onClose: () => void }) {
  const toast = useToast()
  const url = c.code_setup ?? ''
  const site = host(url)
  const signIn = site.endsWith('sdsc.edu')
    ? 'Choose Log In Using Globus, then ACCESS CI, and sign in with your ACCESS login.'
    : `Sign in with the account you use for ${c.name}.`
  const steps: [string, string][] = [
    ['Install an authenticator app', 'Google Authenticator from Google Play. Microsoft Authenticator or Authy work too.'],
    [url ? `Open ${site}` : "Open your cluster's account page", signIn],
    ['Tap Manage 2FA and add the code', 'In the authenticator: tap +, then Scan a QR code, or enter the setup key it shows.'],
    ['Wait up to 15 minutes', `${c.name} takes a while to learn your new code.`],
    ['Connect in HPC Hub', 'When it asks, type the code. It goes as soon as you type 6 digits.'],
  ]
  const tips: [string, string][] = [
    ['Wait for a fresh code', 'Codes last 30 seconds. Type one that just appeared.'],
    ["Check your phone's clock", 'Date and time must be set automatically, or every code is wrong.'],
    ["Don't guess", `${c.name} may lock the account after a few wrong codes.`],
  ]
  return (
    <Sheet title="Authenticator app" onClose={onClose}
      actions={url && <Button kind="primary" icon={ExternalLink} className="flex-1"
        onClick={() => openSystem(url).catch((e) => toast(String(e)))}>Open {site}</Button>}>
      <p className="mb-4 text-dim">{c.name} asks for a 6-digit code at every sign-in. You set this up once.</p>
      <ol className="flex flex-col gap-4">
        {steps.map(([title, sub], i) => (
          <li key={title} className="flex gap-3">
            <span className="w-6 shrink-0 text-xl font-semibold text-accent-text">{i + 1}</span>
            <span><span className="block font-semibold">{title}</span><span className="block text-sm text-dim">{sub}</span></span>
          </li>
        ))}
      </ol>
      <h2 className="mt-6 mb-2 text-sm font-bold text-dim">When a code doesn't work</h2>
      {tips.map(([title, sub]) => (
        <p key={title} className="mb-3"><span className="block font-semibold">{title}</span>
          <span className="block text-sm text-dim">{sub}</span></p>
      ))}
    </Sheet>
  )
}
