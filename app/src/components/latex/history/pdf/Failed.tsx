import { ServerCog } from 'lucide-react'

import { Button } from '../../../ui/Button'

export function Failed({ error, retry }: { error: string; retry: () => void }) {
  return (
    <div className="flex max-w-[460px] flex-col items-center gap-3 text-center">
      <ServerCog size={28} className="text-dim" />
      <p>{error}</p>
      <Button size="sm" onClick={retry}>Try again</Button>
    </div>
  )
}
