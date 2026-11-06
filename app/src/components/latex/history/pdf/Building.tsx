import { Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'

export function Building({ what, clusterName, started }: { what: string; clusterName: string; started: number }) {
  const [, tick] = useState(0)
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 500); return () => clearInterval(t) }, [])
  return (
    <div className="flex flex-col items-center gap-2 text-dim">
      <Loader2 size={22} className="animate-spin" />
      <span>{started ? `${what} is building on ${clusterName}, ${Math.floor((Date.now() - started) / 1000)} s` : 'Waiting for a compute node'}</span>
      <span className="text-xs">It is kept, so next time it opens at once.</span>
    </div>
  )
}
