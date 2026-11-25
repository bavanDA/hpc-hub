import { KeyRound } from 'lucide-react'
import { useState } from 'react'

import { useGo } from '../../../nav'
import { Button } from '../../ui/Button'
import { Spinner } from '../../ui/Spinner'
import { useToast } from '../../useToast'
import { type GhDetails, ghGuide } from './github'
import { signInWithGh } from './signIn'

/** What to do when GitHub turns down git's sign-in: sign in with gh in a terminal, then Try again. */
export function GhGuide({ cluster, details }: { cluster: string; details: GhDetails }) {
  const go = useGo()
  const toast = useToast()
  const [opening, setOpening] = useState(false)
  const g = ghGuide(details)
  const open = () => {
    setOpening(true)
    signInWithGh(cluster, go)
      .catch((e: Error) => toast(`Could not open the sign-in: ${e.message}`, { kind: 'error' }))
      .finally(() => setOpening(false))
  }
  return (
    <div className="mt-4 flex max-w-[620px] items-start gap-3 rounded-xl bg-inset p-4 text-sm">
      <KeyRound size={18} className="mt-0.5 shrink-0" />
      <div className="flex min-w-0 flex-col gap-2">
        <h3 className="font-semibold">{g.title}</h3>
        <ol className="list-decimal pl-5">{g.steps.map((s) => <li key={s}>{s}</li>)}</ol>
        <div><Button kind="primary" onClick={open} disabled={opening}>
          {opening && <Spinner size={14} />} {g.button}</Button></div>
        <p className="text-dim">{g.setupGit}</p>
      </div>
    </div>
  )
}
