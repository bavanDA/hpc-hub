// How to set up Google Authenticator for a cluster that asks for a 6-digit code (authenticator_help.py).
import { Copy } from 'lucide-react'

import type { Cluster } from '../../types/clusters'
import { useToast } from '../toast'
import { Button, Dialog, Row } from '../ui'
import { Group } from './fields'

function host(url: string) {
  try { return new URL(url).hostname } catch { return url }
}

export function AuthenticatorHelp({ cluster: c, onClose }: { cluster: Cluster; onClose: () => void }) {
  const toast = useToast()
  const url = c.code_setup ?? ''
  const site = host(url)
  const signIn = site.endsWith('sdsc.edu')
    ? 'Choose Log In Using Globus, then ACCESS CI, and sign in with your ACCESS login'
    : `Sign in with the account you use for ${c.name}`
  const steps: [string, string][] = [
    ['Install Google Authenticator on your phone',
      'From the App Store or Google Play. Microsoft Authenticator or Authy work too.'],
    [url ? `Open ${site}` : "Open your cluster's account page", signIn],
    ['Click Manage 2FA and scan the QR code',
      'In Google Authenticator: tap +, then Scan a QR code. A new entry shows a code that changes every 30 seconds.'],
    ['Wait up to 15 minutes', `${c.name} takes a while to learn your new code.`],
    ['Connect in HPC Hub', `When it asks, type the code shown for ${c.name}. It is sent as soon as you type 6 digits.`],
  ]
  const tips: [string, string][] = [
    ['Wait for a fresh code', 'Codes last 30 seconds. Type one that just appeared.'],
    ["Check your phone's clock", 'Date and time must be set automatically, or every code is wrong.'],
    ["Don't guess", `${c.name} may lock the account after a few wrong codes.`],
    ['It never asks for a code', 'Then no authenticator is set up yet, or the 15 minutes are not over.'],
  ]
  async function copy() {
    try { await navigator.clipboard.writeText(url); toast('Link copied') } catch { toast(url) }
  }
  return (
    <Dialog title="Google Authenticator" onClose={onClose} width={540}
      actions={url && <Button kind="suggested" onClick={copy}><Copy size={15} /> Copy link to {site}</Button>}>
      <Group title={`Set up codes for ${c.name}`}
        description={`${c.name} asks for a 6-digit code from your phone at every login. You set this up once.`}>
        {steps.map(([title, sub], i) => (
          <Row key={i} title={<span className="whitespace-normal">{title}</span>}
            subtitle={<span className="whitespace-normal">{sub}</span>}
            prefix={<span className="w-6 text-xl font-bold text-accent-text">{i + 1}</span>} />
        ))}
      </Group>
      <Group title="If a code is refused">
        {tips.map(([title, sub]) => (
          <Row key={title} title={title} subtitle={<span className="whitespace-normal">{sub}</span>} />
        ))}
      </Group>
    </Dialog>
  )
}
