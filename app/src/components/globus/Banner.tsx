// The strip at the top when collections want something first: one Allow (or one sign-in) covers all of them.
import { KeyRound } from 'lucide-react'

import type { Want } from '../../types/globus'
import { Button } from '../ui'
import { names } from './parts'

export function Banner({ wants, onClick }: { wants: Want[]; onClick: () => void }) {
  const allow = wants.filter((w) => w.kind === 'consent').map((w) => w.name)
  const domainWants = wants.filter((w) => w.kind === 'domain')
  const domain = domainWants[0]?.domains[0] ?? ''
  if (!allow.length && !domain) return null
  const text = domain
    ? `${names(domainWants.map((w) => w.name))} wants you signed in with your ${domain} account` +
      (allow.length ? `. ${names(allow)} also needs your OK` : '')
    : `Globus needs your OK to use ${names(allow)}. One time`
  return (
    <div className="flex items-center gap-3 rounded-xl bg-accent/15 px-4 py-2.5">
      <KeyRound size={18} className="shrink-0 text-accent-text" />
      <span className="min-w-0 flex-1 font-bold">{text}</span>
      <Button kind="suggested" onClick={onClick}>{domain ? 'Sign in' : 'Allow'}</Button>
    </div>
  )
}
