import { useEffect, useState } from 'react'

import { call } from '@shared/rpc'

export default function App() {
  const [text, setText] = useState('Starting the backend...')
  useEffect(() => {
    call<unknown>('clusters.list').then((r) => setText(JSON.stringify(r, null, 1)), (e: Error) => setText(e.message))
  }, [])
  return <pre className="p-4 text-xs whitespace-pre-wrap">{text}</pre>
}
