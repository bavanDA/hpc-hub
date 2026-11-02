// Shapes of what hpc_hub/api/methods/globus.py sends.
export type GlobusCluster = { id: string; name: string; collection_id: string; collection_name: string
  personal?: boolean }  // your own Globus Connect runs there (Wulver): it can be restarted

/** What a cluster's collection wants before it lists files: an Allow, or an account from a domain. */
export type Want = {
  cluster: string
  name: string
  collection: string
  kind: 'consent' | 'domain'
  domains: string[]
  message: string
}

export type GlobusStatus = { client_id: string; signed_in: boolean; clusters: GlobusCluster[]; wants: Want[] }

export type CheckResult = GlobusStatus & { changes: { cluster: string; name: string; collection: string }[] }

/** A sign-in in progress; the backend keeps its PKCE verifier under this id. */
export type Login = { id: string; url: string; fresh: boolean; domain: string; what: string }

export type Item = { name: string; is_dir: boolean; size: number; modified: string }

export type Listing = {
  cluster: string
  collection: string
  path: string
  items: Item[]
  state: 'ok' | 'none' | 'consent' | 'domain' | 'offline' | 'hidden'
  want?: Want
}

export type Collection = { id: string; name: string; owner: string; kind: string; mine: boolean; best: boolean }

export type Task = {
  task_id: string
  label: string
  status: string  // ACTIVE, INACTIVE (paused), SUCCEEDED, FAILED
  nice_status: string
  problem: string
  source: string
  destination: string
  bytes: number
  files_done: number
  files: number  // 0 while Globus is still counting
  rate: number
  request_time: string
  active: boolean
  cancelled: boolean
}
