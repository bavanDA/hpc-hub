// Shapes of what hpc_hub/api/methods/latex.py sends.
export type LatexCluster = { id: string; name: string; connected: boolean }

export type LatexProject = {
  id: string  // cluster:path
  name: string
  cluster: string
  cluster_name: string
  path: string
  main_tex: string  // relative to path
  opened: number
}

/** A folder with a .tex file that has \documentclass, found by searching the cluster. */
export type Paper = {
  cluster: string
  cluster_name: string
  folder: string
  main: string
  mtime: number
  others: number
  short: string  // scratch/thesis/paper, ~/papers/a
  title: string  // parent / folder
}

export type Picker = {
  clusters: LatexCluster[]
  projects: LatexProject[]
  papers: Paper[]
  found_at: Record<string, number>
}

export type TreeEntry = { kind: 'd' | 'f'; path: string }  // path relative to the project folder

export type Settings = { setup: string; engine: 'pdf' | 'xelatex' | 'lualatex'; on_node: boolean }

export type Opened = {
  cluster: string
  cluster_name: string
  name: string
  folder: string
  main: string  // absolute
  tree: TreeEntry[]
  settings: Settings
}

/** latex.open on a folder with more than one main file. */
export type Choices = { choices: string[]; folder: string }

export type Issue = { file: string; line: number; message: string; level: 'error' | 'warning' | 'box' }

export type BuildDone = {
  id: string
  cluster: string
  main: string
  ok: boolean
  code: number
  stopped: boolean
  seconds: number
  issues: Issue[]
  log: string
}

export type PdfInfo = { path: string; size: number; mtime: number }

export type Spot = { page: number; x: number; y: number }  // PDF points from the page's top left

export type SourceSpot = { path: string; line: number }

export type Commit = { hash: string; date: string; author: string; subject: string }

export type GitInfo = {
  root: string  // "" when the folder is not a git repository
  branch: string
  remotes: { name: string; url: string }[]
  changes: { status: string; path: string }[]
  history: Commit[]
}
