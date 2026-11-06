import { useEffect, useState } from 'react'

import { call } from '../../rpc'
import type { Cluster, KeyTest, MyKey } from '../../types/clusters'
import { copyText } from '../app/clipboard'
import { openSystem } from '../app/openLink'
import { pickKeyFile } from './pickKeyFile'

/** signedIn: the cluster is connected now, so the key works and the test step starts done. */
export type PanelProps = { cluster: Cluster; user: string; onUser: (u: string) => void; onTested?: (ok: boolean) => void
  signedIn?: boolean }

/** The key's state and what you can do with it. */
export function useKeySignIn({ cluster: c, user, onTested }: PanelProps) {
  const [key, setKey] = useState<MyKey | null | undefined>(undefined)
  const [how, setHow] = useState<'found' | 'made' | 'picked'>('found')
  const [added, setAdded] = useState(false)
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [test, setTest] = useState<KeyTest | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    call<MyKey | null>('keys.mine', { cluster: c.id }).then((k) => {
      setKey(k)
      if (k && user.trim()) setAdded(true)  // a key and a username from before: set up already, start at the test
    }).catch(() => setKey(null))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (what: () => Promise<void>) => {
    setError('')
    try { await what() } catch (e) { setError((e as Error).message) }
  }
  return {
    key, how, added, copied, busy, test, error,
    setAdded, clearTest: () => { setTest(null); onTested?.(false) },
    make: () => run(async () => {
      setBusy(true)
      try { setKey(await call<MyKey>('keys.create')); setHow('made') } finally { setBusy(false) }
    }),
    pick: () => run(async () => {
      const path = await pickKeyFile()
      if (!path) return
      setKey(await call<MyKey>('keys.use', { cluster: c.id, path }))
      setHow('picked')
      setTest(null)
      onTested?.(false)
    }),
    copyKey: () => run(async () => {
      await copyText(key!.public)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }),
    openPage: () => openSystem(c.key_page!),
    check: () => run(async () => {
      setBusy(true)
      setTest(null)
      try {
        const got = await call<KeyTest>('keys.test', { cluster: c.id, username: user })
        setTest(got)
        onTested?.(got.ok)
      } finally { setBusy(false) }
    }),
  }
}
