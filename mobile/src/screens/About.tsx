// More › About: what the app is and its version.
import { useEffect, useState } from 'react'

import { call } from '@shared/rpc'
import { Header } from '../parts/Header'
import { List, Row } from '../ui'

export function About() {
  const [version, setVersion] = useState('')
  useEffect(() => { call<{ version: string }>('app.version').then((v) => setVersion(v.version)).catch(() => {}) }, [])
  return (
    <div className="flex h-full flex-col">
      <Header title="About" />
      <div className="min-h-0 flex-1 overflow-y-auto pb-8">
        <p className="px-4 pb-5">Your HPC clusters in one place: connect, get a compute node, follow your jobs, and work in
          terminals, files and agents.</p>
        <List>
          <Row label="Version" value={version || 'Unknown'} />
          <Row label="License" value="MIT, open source" />
          <Row label="Passwords" value="Encrypted on this phone" />
        </List>
      </div>
    </div>
  )
}
