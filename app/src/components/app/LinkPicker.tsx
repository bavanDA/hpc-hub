import { Check, Copy, ExternalLink } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Button, Dialog, List, Row } from '../ui'
import { useToast } from '../useToast'
import { copyText } from './clipboard'
import { openIn, setAsk } from './openLink'
import type { Profiles } from './types'

const short = (url: string) => url.length < 90 ? url : url.slice(0, 87) + '…'

export function LinkPicker() {
  const toast = useToast()
  const [shown, setShown] = useState<{ url: string; found: Profiles } | null>(null)
  const [picked, setPicked] = useState('')
  useEffect(() => {
    setAsk((url, found) => {
      setPicked(found.profiles.find((p) => p.name.toLowerCase() === found.default.toLowerCase())?.name ?? '')
      setShown({ url, found })
    })
    return () => setAsk(null)
  }, [])
  if (!shown) return null
  const close = () => setShown(null)
  const go = (profile = picked) => {
    close()
    openIn(shown.url, profile).catch((e: Error) => toast(`Could not open the link: ${e.message}`))
  }
  const copy = () => {
    close()
    copyText(shown.url).then(() => toast('Link copied'), () => toast('Could not copy'))
  }
  const options: [string, string, string][] = [['', 'System browser', ''],
    ...shown.found.profiles.map((p): [string, string, string] => [p.name, `Chrome: ${p.name}`, p.email])]
  return (
    <Dialog title="Open link" onClose={close} width={460}
      actions={<>
        <Button onClick={close}>Cancel</Button>
        <Button onClick={copy}><Copy size={16} />Copy link</Button>
        <Button kind="primary" onClick={() => go()} autoFocus><ExternalLink size={16} />Open</Button>
      </>}>
      <p className="mb-4 break-all text-center text-sm text-dim" title={shown.url}>{short(shown.url)}</p>
      <List>
        {options.map(([name, title, email]) => (
          <button key={name || '-'} onClick={() => setPicked(name)} onDoubleClick={() => go(name)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); go(name) } }}
            role="radio" aria-checked={picked === name} className="block w-full text-left">
            <Row title={title} subtitle={email || undefined} onClick={() => {}}
              suffix={picked === name ? <Check size={20} className="text-accent-text" /> : <span className="w-[18px]" />} />
          </button>
        ))}
      </List>
    </Dialog>
  )
}
