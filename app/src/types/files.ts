// Shapes of what hpc_hub/api/methods/files.py sends.
export type Entry = {
  name: string
  kind: string  // d folder, f file, l broken link...
  size: number
  mtime: number  // seconds
}

export type Listing = { path: string; entries: Entry[] }

export type Place = { label: string; path: string }

export type FileData = {
  kind: 'text' | 'image' | 'pdf' | 'binary'
  mime: string
  size: number
  text?: string
  data?: string  // base64, for images and PDFs
  cut: boolean  // text only: the file goes on past the limit
}

export type CopyPlan = { sizes: { name: string; size: number }[]; total: number }

export type Transfer = {
  id: string
  title: string
  how: 'laptop' | 'globus' | 'cluster'
  done: number  // bytes, or files for Globus
  total: number
  status: string  // "" while a copy through the laptop runs: show done of total
  finished: boolean
  error: string
}

/** What Copy put aside, to paste on any cluster. */
export type Clip = { cluster: string; clusterName: string; path: string; name: string; folder: boolean }

export type SortKey = 'name' | 'size' | 'mtime'
export type Sort = { key: SortKey; desc: boolean }
