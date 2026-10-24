// Shapes the projects.* methods send (see hpc_hub/api/methods/projects.py).
export type Project = {
  id: string  // cluster:path
  name: string
  cluster: string
  cluster_name: string  // empty: a cluster you no longer have
  path: string
  main_tex: string
  kind: string
  latex: boolean
  opened: number
  copy_to: string
  copy_into: string
}

export type ProjectCluster = { id: string; name: string; connected: boolean }

export type ProjectList = { experimental: boolean; clusters: ProjectCluster[]; projects: Project[] }

export type Place = { label: string; path: string }

export type Places = { home: string; places: Place[]; storage: Place[] }

export type Folder = { path: string; home: string; folders: string[] }

export type CopyTarget = ProjectCluster & { globus_missing: string }

export type CopyTargets = { name: string; copy_to: string; copy_into: string; targets: CopyTarget[] }

export type CopyPlan = {
  parts: { name: string; size: number; keep: boolean }[]
  chats: { id: string; name: string; size: number }[]
  parts_error: string
  chats_error: string
}

export type Transfer = {
  id: string
  title: string
  done: number
  total: number
  status: string
  finished: boolean
  error: string
}

export const TEMPLATES = ['Empty', 'LaTeX paper', 'Python'] as const
