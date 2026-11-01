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
          <p className="text-lg font-bold">HPC Hub</p>
          <p className="text-sm text-dim">{version ? `Version ${version}` : 'Version unknown'}</p>
          <p className="mt-3">Your HPC clusters in one place: connect, get a compute node, follow your jobs, and work in
            terminals, files and agents.</p>
          <p className="mt-3 text-sm text-dim">Open source, MIT license. Your passwords stay encrypted on this phone.</p>
        </Card>
      </div>
    </div>
  )
}
