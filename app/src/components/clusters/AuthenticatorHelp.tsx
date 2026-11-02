// How to set up Google Authenticator for a cluster that asks for a 6-digit code (authenticator_help.py), in style E.
import { Copy, ExternalLink } from 'lucide-react'

import type { Cluster } from '../../types/clusters'
import { openSystem } from '../app/openLink'
import { Button } from '../e/parts'
import { EDialog, MainButton, Row, Section } from '../e/ui'
import { useToast } from '../toast'
import { shortName } from './loginCopy'

function host(url: string) {
  try { return new URL(url).hostname } catch { return url }
}

export function AuthenticatorHelp({ cluster: c, onClose }: { cluster: Cluster; onClose: () => void }) {
  const toast = useToast()
  const url = c.code_setup ?? ''
  const site = host(url)
  const short = shortName(c)
  const signIn = site.endsWith('sdsc.edu')
    ? 'Choose Log In Using Globus, then ACCESS CI, and sign in with your ACCESS login.'
    : `Sign in with the account you use for ${short}.`
  const steps: [string, string][] = [
    ['Install Google Authenticator on your phone',
      'From the App Store or Google Play. Microsoft Authenticator or Authy work too.'],
    [url ? `Open ${site}` : "Open your cluster's account page", signIn],
    ['Click Manage 2FA and scan the QR code',
      'In Google Authenticator: tap +, then Scan a QR code. A new entry shows a code that changes every 30 seconds.'],
    ['Wait up to 15 minutes', `${short} takes a while to learn your new code.`],
    ['Connect in HPC Hub', `When it asks, type the code shown for ${short}. It is sent as soon as you type 6 digits.`],
  ]
  const tips: [string, string][] = [
    ['Wait for a fresh code', 'Codes last 30 seconds. Type one that just appeared.'],
    ["Check your phone's clock", 'Date and time must be set automatically, or every code is wrong.'],
    ["Don't guess", `${short} may lock the account after a few wrong codes.`],
    ['It never asks for a code', 'Then no authenticator is set up yet, or the 15 minutes are not over.'],
  ]
  async function copy() {
    try { await navigator.clipboard.writeText(url); toast('Link copied') } catch { toast(url) }
  }
  return (
    <EDialog title={`Codes for ${c.name}`} width={560} onClose={onClose} actions={url && <>
      <Button icon={Copy} onClick={copy}>Copy link</Button>
      <MainButton className="flex-1" onClick={() => openSystem(url)}>Open {site}<ExternalLink size={16} /></MainButton>
    </>}>
      <p className="px-5 pb-1 text-dim">{short} asks for a 6-digit code from your phone at every sign-in. You set
        this up once.</p>
      <Section>
        {steps.map(([title, sub], i) => (
          <Row key={i} label={<span className="flex gap-3"><span className="w-4 shrink-0 font-semibold text-dim
            tabular-nums">{i + 1}</span>{title}</span>} sub={<span className="block pl-7">{sub}</span>} />
        ))}
      </Section>
      <Section title="When a code is refused">
        {tips.map(([title, sub]) => <Row key={title} label={title} sub={sub} />)}
      </Section>
    </EDialog>
  )
}
