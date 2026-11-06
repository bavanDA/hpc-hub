import { useEffect, useState } from 'react'

import { call } from '../../rpc'
import type { Logins } from '../../types/clusters'

export type Login = ReturnType<typeof useLogin>

/** The cluster's login as you type it, starting from the saved one. */
export function useLogin(cluster: string) {
  const [saved, setSaved] = useState<Logins | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState('')
  const [user, setUser] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [usePassword, setUsePassword] = useState(false)  // a key cluster that takes a password too
  useEffect(() => {
    call<Logins>('clusters.login', { cluster }).then((l) => {
      setSaved(l)
      setUser(l.ssh.username)
      setRemember(l.remember ?? true)
    }).catch((e: Error) => setFailed(e.message)).finally(() => setLoaded(true))
  }, [cluster])
  const changed = !!password || (!!saved && (user !== saved.ssh.username || remember !== (saved.remember ?? true)))
  const save = () => call('clusters.set_login', { cluster, kind: 'ssh', username: user, password, remember })
  return { saved, setSaved, loaded, failed, user, setUser, password, setPassword, remember, setRemember,
    usePassword, setUsePassword, changed, save }
}
