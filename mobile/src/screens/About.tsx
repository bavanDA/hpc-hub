// More › About: what the app is and its version.
import { useEffect, useState } from 'react'

import { call } from '@shared/rpc'
import { Header } from '../parts/Header'
import { Card } from '../ui'

export function About() {
  const [version, setVersion] = useState('')
  useEffect(() => { call<{ version: string }>('app.version').then((v) => setVersion(v.version)).catch(() => {}) }, [])
  return (
    <div className="flex h-full flex-col">
      <Header title="About" />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        <Card>
          <p className="font-bold">HPC Hub {version}</p>
          <p className="text-sm text-dim">Your HPC clusters in one place. Open source, MIT license.</p>
        </Card>
      </div>
    </div>
  )
}
