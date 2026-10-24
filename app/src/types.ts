// Shapes of what the Python backend sends (see hpc_hub/core/config.py and hpc_hub/api).
export type Cluster = {
  id: string
  name: string
  host: string
  vpn: { enabled: boolean; gateway: string }
  profile: { cpus: number; mem_gb: number; time: string; partition: string }
}

export type Session = {
  id: string
  state: 'Disconnected' | 'Connecting VPN' | 'Signing in' | 'Approve Duo on your phone' |
    'Requesting compute node' | 'Connected' | 'Disconnecting' | 'Error'
  detail?: string
  node?: string
  job?: string
  log?: string
}
