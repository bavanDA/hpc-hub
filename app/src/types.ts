// Shapes of what the Python backend sends (see hpc_hub/core/config.py).
export type Cluster = {
  id: string
  name: string
  host: string
  vpn: { enabled: boolean; gateway: string }
  profile: { cpus: number; mem_gb: number; time: string; partition: string }
}
