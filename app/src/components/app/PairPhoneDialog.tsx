// Set up the phone app: your logins as a QR code the phone scans (pairing.make), like the GTK app's
// connect/ui/phone_pair.py. A cluster that takes keys gets a new key for the phone first, over the connection here.
// Shown only on a click and hidden after SHOWN seconds, since anyone who sees the code sees what's in it.
import { Smartphone } from 'lucide-react'
import { useEffect, useState } from 'react'

import { call } from '../../rpc'
import type { Cluster, Logins } from '../../types/clusters'
import { useClusters } from '../clusters/store'
import { Button, Dialog, IconTile, List, Row, Spinner, Switch } from '../ui'

const SHOWN = 60

type Made = { svg: string; clusters: string[]; skipped: { name: string; reason: string }[] }
type Pick = { cluster: Cluster; username: string; password: boolean; ready: boolean; note: string }

const takesKeys = (c: Cluster) => Boolean((c as Cluster & { key_login?: boolean }).key_login)

/** only: these clusters (a cluster card's "Connect phone"); the code shows right away when they're ready. */
export function PairPhoneDialog({ only, onClose }: { only?: string[]; onClose: () => void }) {
  const { clusters, sessions } = useClusters()
  const [picks, setPicks] = useState<Pick[] | null>(null)
  const [on, setOn] = useState<Set<string>>(new Set())
  const [passwords, setPasswords] = useState(true)
  const [made, setMade] = useState<Made | null>(null)
  const [left, setLeft] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {  // which clusters have a saved login, and whether each one is ready to go to the phone
    if (!clusters) return
    const wanted = clusters.filter((c) => !only || only.includes(c.id))
    Promise.all(wanted.map((c) => call<Logins>('clusters.login', { cluster: c.id })
      .then((l) => ({ c, l }), () => ({ c, l: null as Logins | null }))))
      .then((rows) => {
        const list = rows.filter((r) => r.l?.ssh.username).map(({ c, l }): Pick => {
          const keys = takesKeys(c)
          const ready = !keys || !!sessions[c.id]?.connected
          const note = keys ? (ready ? 'gets a key for the phone' : 'connect it first, to add a key for the phone')
            : l!.ssh.password ? 'password saved' : ''
          return { cluster: c, username: l!.ssh.username, password: !!l!.ssh.password, ready, note }
        })
        setPicks(list)
        setOn(new Set(list.filter((p) => p.ready).map((p) => p.cluster.id)))
      })
  }, [clusters, sessions, only?.join(',')])  // eslint-disable-line react-hooks/exhaustive-deps

  async function show(ids = [...on]) {
    setBusy(true)
    setError('')
    try {
      setMade(await call<Made>('pairing.make', { clusters: ids, passwords }))
      setLeft(SHOWN)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const [started, setStarted] = useState(false)
  useEffect(() => {  // a cluster card's "Connect phone": straight to the code when it can be made
    if (!only || started || !picks) return
    setStarted(true)
    const ready = picks.filter((p) => p.ready).map((p) => p.cluster.id)
    if (ready.length && ready.length === picks.length) void show(ready)
  }, [picks])  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {  // count down, then hide the code
    if (!made) return
    if (left <= 0) { setMade(null); return }
    const t = window.setTimeout(() => setLeft(left - 1), 1000)
    return () => clearTimeout(t)
  }, [made, left])

  const toggle = (id: string) => setOn((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  return (
    <Dialog title="Set up the phone app" onClose={onClose} width={520} actions={made
      ? <Button onClick={() => setMade(null)}>Hide</Button>
      : <>
          <Button kind="ghost" onClick={onClose}>Cancel</Button>
          <Button kind="primary" disabled={busy || !on.size} onClick={() => void show()}>
            {busy && <Spinner size={14} />}Show QR code</Button>
        </>}>
      {made ? (
        <div className="flex flex-col items-center gap-3 pb-2 text-center">
          <h3 className="text-xl font-semibold">Scan it with the phone</h3>
          <p className="text-dim">In HPC Hub on the phone, tap QR code on a cluster. Hides in {left} s.</p>
          <img src={`data:image/svg+xml;utf8,${encodeURIComponent(made.svg)}`} alt="QR code with your logins"
            className="size-[300px] rounded-md bg-white p-3 [image-rendering:pixelated]" />
          <p className="text-sm text-dim">Has: {made.clusters.join(', ')}</p>
          {made.skipped.map((s) => <p key={s.name} className="text-sm text-warn">{s.name}: {s.reason}</p>)}
        </div>
      ) : (
        <div className="flex flex-col gap-4 pb-2">
          <div className="flex items-center gap-3">
            <IconTile icon={Smartphone} />
            <p className="text-dim">Each login you pick goes to HPC Hub on your phone. Duo still asks when the phone
              connects.</p>
          </div>
          {!picks ? <p className="flex items-center gap-2 text-dim"><Spinner size={14} /> Looking at your logins</p>
            : !picks.length ? <p className="text-dim">No saved logins yet. Connect to a cluster here first.</p>
            : (
              <List>
                {picks.map((p) => (
                  <Row key={p.cluster.id} title={p.cluster.name}
                    subtitle={`${p.username}${p.note ? `, ${p.note}` : ''}`}
                    suffix={<Switch on={on.has(p.cluster.id)} onChange={() => toggle(p.cluster.id)}
                      disabled={!p.ready} label={`Send ${p.cluster.name} to the phone`} />} />
                ))}
              </List>
            )}
          <List>
            <Row title="Include passwords" subtitle={passwords ? 'The phone signs in by itself'
              : 'The phone asks for each password'}
              suffix={<Switch on={passwords} onChange={setPasswords} label="Include passwords" />} />
          </List>
          {error && <p className="text-sm text-bad">{error}</p>}
        </div>
      )}
    </Dialog>
  )
}
