// Demo data for the Projects page: made-up projects on made-up accounts; adding and removing work in memory.
import type { CopyPlan, CopyTargets, Folder, Places, Project, ProjectList } from '../types/projects'

const clusters = [
  { id: 'wulver', name: 'Wulver (NJIT)', connected: true },
  { id: 'yale', name: 'Yale Bouchet', connected: true },
  { id: 'sdsc', name: 'SDSC Expanse', connected: false },
]
const name = (id: string) => clusters.find((c) => c.id === id)?.name ?? ''

function project(n: string, cluster: string, path: string, extra: Partial<Project> = {}): Project {
  return { id: `${cluster}:${path}`, name: n, cluster, cluster_name: name(cluster), path, main_tex: '', kind: 'code',
    latex: false, opened: 0, copy_to: '', copy_into: '', ...extra }
}

let projects: Project[] = [
  project('thesis', 'wulver', '/mmfs1/project/mygroup/jdoe/thesis', { opened: 4 }),
  project('climate-model', 'yale', '/home/jdoe/project/climate-model', { opened: 3 }),
  project('simulations', 'sdsc', '/expanse/lustre/projects/abc123/jdoe/simulations', { opened: 2 }),
  project('paper', 'wulver', '/home/jdoe/paper', { main_tex: 'main.tex', kind: 'latex', latex: true, opened: 1 }),
]

const tree: Record<string, string[]> = {
  '/home/jdoe': ['.cache', '.config', 'paper', 'project', 'scratch', 'notebooks', 'tools'],
  '/home/jdoe/project': ['climate-model', 'shared'],
  '/mmfs1/project/mygroup/jdoe': ['thesis', 'datasets', 'runs'],
  '/mmfs1/scratch/mygroup/jdoe': ['tmp', 'checkpoints'],
}

const places = (cluster: string): Places => {
  const project = cluster === 'yale' ? '/nfs/roberts/project/mygroup/jdoe' : '/mmfs1/project/mygroup/jdoe'
  const scratch = cluster === 'yale' ? '/nfs/roberts/scratch/mygroup/jdoe' : '/mmfs1/scratch/mygroup/jdoe'
  return {
    home: '/home/jdoe',
    places: [{ label: 'Home', path: '/home/jdoe' }, { label: 'project/mygroup', path: project },
      { label: 'scratch/mygroup', path: scratch }],
    storage: [{ label: 'Home', path: '~' }, { label: 'Project', path: project }, { label: 'Scratch', path: scratch }],
  }
}

const browse = ({ path }: { path: string }): Folder => {
  const full = (path.startsWith('~') ? '/home/jdoe' + path.slice(1) : path).replace(/\/+$/, '') || '/'
  return { path: full, home: '/home/jdoe', folders: [...(tree[full] ?? [])].sort() }
}

const plan: CopyPlan = {
  parts: [{ name: 'data', size: 18_400_000_000, keep: true }, { name: 'results', size: 2_100_000_000, keep: true },
    { name: '.venv', size: 912_000_000, keep: true }, { name: 'src', size: 4_300_000, keep: true },
    { name: '.claude', size: 1_200_000, keep: false }, { name: 'README.md', size: 2_400, keep: true }],
  chats: [{ id: 'c1', name: 'Speed up the data loader', size: 1_840_000 },
    { id: 'c2', name: 'Fix the Slurm array job', size: 620_000 }],
  parts_error: '', chats_error: '',
}

const saved = (n: string, cluster: string, path: string) => {
  const p = project(n, cluster, path.replace(/^~/, '/home/jdoe'), { opened: Date.now() / 1000 })
  projects = [p, ...projects]
  return p
}

export const answers: Record<string, unknown> = {
  'projects.list': (): ProjectList => ({
    experimental: false, clusters,
    projects: [...projects].sort((a, b) => b.opened - a.opened),
  }),
  'projects.add': ({ name: n, cluster, path }: { name: string; cluster: string; path: string }) =>
    saved(n, cluster, path),
  'projects.create': ({ name: n, cluster, parent }: { name: string; cluster: string; parent: string }) =>
    saved(n, cluster, `${parent.replace(/\/+$/, '')}/${n.trim().replace(/[^\w.-]+/g, '-')}`),
  'projects.update': ({ id, ...rest }: { id: string; name: string; cluster: string; path: string }) => {
    projects = projects.map((p) => p.id === id ? project(rest.name, rest.cluster, rest.path, { opened: p.opened }) : p)
    return projects.find((p) => p.path === rest.path)
  },
  'projects.remove': ({ id }: { id: string }) => { projects = projects.filter((p) => p.id !== id) },
  'projects.opened': ({ id }: { id: string }) => projects.find((p) => p.id === id),
  'projects.places': ({ cluster }: { cluster: string }) => places(cluster),
  'projects.browse': browse,
  'projects.mkdir': ({ path }: { path: string }) => {
    const parent = path.replace(/\/[^/]+$/, '')
    tree[parent] = [...(tree[parent] ?? []), path.split('/').pop()!].sort()
  },
  'projects.copy_targets': ({ id }: { id: string }): CopyTargets => {
    const p = projects.find((x) => x.id === id)!
    return { name: p.path.split('/').pop()!, copy_to: '', copy_into: '',
      targets: clusters.filter((c) => c.id !== p.cluster).map((c) => ({
        ...c, globus_missing: c.id === 'sdsc' ? 'a Globus collection for SDSC Expanse' : '' })) }
  },
  'projects.copy_plan': () => new Promise((done) => setTimeout(() => done(plan), 600)),
  'projects.copy': () => ({ id: 'project-demo', chats: '' }),
  'projects.cancel_copy': null,
}
