// Demo data for the Skills page: Wulver has a few skills, Yale has none of its own, Expanse is not connected.
import type { CatalogSkill, Skill, SkillList, Target } from '../types/skills'

const targets: Target[] = [
  { id: 'claude', label: 'Claude', folder: '~/.claude/skills' },
  { id: 'codex', label: 'ChatGPT', folder: '~/.codex/skills' },
  { id: 'cursor', label: 'Cursor', folder: '~/.cursor/skills' },
  { id: 'agy', label: 'Antigravity', folder: '~/.gemini/config/skills' },
]
const rel = Object.fromEntries(targets.map((t) => [t.id, t.folder.slice(2)]))

const catalog: [string, string][] = [
  ['code-review', 'Review the changes since a commit or branch: does the code follow the standards, does it do ' +
    'what was asked?'],
  ['codebase-design', 'Shared words for designing deep modules: where a seam goes, how to make code easier to test.'],
  ['diagnosing-bugs', 'A loop for hard bugs and slow code. Use it when something is broken, throwing or slow.'],
  ['grill-me', 'A relentless interview to sharpen a plan or design.'],
  ['handoff', 'Sum up the conversation in a short note another agent can pick up.'],
  ['improve-codebase-architecture', 'Scan the code for modules worth deepening and walk through the one you pick.'],
  ['tdd', 'Test-driven development: red, green, refactor. Use it to build features or fix bugs test first.'],
]

const sk = (target: string, folder: string, name: string, description: string, managed = false): Skill =>
  ({ path: `/home/jdoe/${rel[target]}/${managed ? 'synced/' : ''}${folder}`, folder, name, description, target,
    managed })

const installed: Record<string, Skill[]> = {
  wulver: [
    sk('claude', 'tdd', 'tdd', catalog[6][1]),
    sk('claude', 'slurm-helper', 'slurm-helper', 'Write and fix Slurm batch scripts for this cluster.'),
    sk('claude', 'paper-figures', 'paper-figures', 'Make matplotlib figures that fit a two column paper.'),
    sk('claude', 'pdf', 'pdf', 'Read, fill and merge PDF files.', true),
    sk('claude', 'docx', 'docx', 'Create and edit Word documents.', true),
    sk('codex', 'tdd', 'tdd', catalog[6][1]),
    sk('codex', 'skill-creator', 'skill-creator', 'Make a new skill.', true),
  ],
  yale: [sk('claude', 'pdf', 'pdf', 'Read, fill and merge PDF files.', true)],
}

const repo: Skill[] = [
  ['grill-me', 'A relentless interview to sharpen a plan or design.'],
  ['write-a-prd', 'Turn a conversation into a product requirements document.'],
  ['prd-to-issues', 'Split a requirements document into small issues you can pick up one by one.'],
  ['tdd', 'Test-driven development: red, green, refactor.'],
  ['ubiquitous-language', 'Collect the words your project uses and what each one means.'],
  ['git-guardrails', 'Stop an agent from running dangerous git commands.'],
  ['migrate-to-shoehorn', 'Move tests from as casts to a typed helper.'],
  ['setup-pre-commit', 'Set up pre-commit hooks for formatting and type checks.'],
  ['write-a-skill', 'Make a new skill with the right layout and front matter.'],
].map(([name, description]) => ({ path: `/home/jdoe/.hpc-hub/skill-repos/github.com-jdoe-skills/${name}`,
  folder: name, name, description, target: '', managed: false }))

function list({ cluster }: { cluster: string }): SkillList {
  const got = installed[cluster]
  if (!got) throw new Error('Connect to SDSC Expanse first')
  const on = (folder: string) => targets.filter((t) => got.some((k) => k.folder === folder && k.target === t.id))
    .map((t) => t.id)
  const cat: CatalogSkill[] = catalog.map(([folder, description]) => ({ path: '', folder, name: folder, description,
    target: '', managed: false, on: on(folder) }))
  return { name: cluster === 'wulver' ? 'Wulver (NJIT)' : 'Yale Bouchet', targets, installed: got, catalog: cat,
    default_repo: 'https://github.com/jdoe/skills.git' }
}

const later = <T>(value: () => T, ms = 600) => new Promise<T>((done, fail) => setTimeout(() => {
  try { done(value()) } catch (e) { fail(e) }
}, ms))

function add(cluster: string, picked: { folder: string; name: string; description: string }[], to: string[]) {
  for (const t of to) {
    for (const p of picked) {
      installed[cluster] = installed[cluster].filter((k) => !(k.target === t && k.folder === p.folder))
      installed[cluster].push(sk(t, p.folder, p.name, p.description))
    }
  }
}

export const answers: Record<string, unknown> = {
  'skills.list': list,
  'skills.add': ({ cluster, folder, targets: to }: { cluster: string; folder: string; targets: string[] }) =>
    later(() => add(cluster, catalog.filter(([f]) => f === folder).map(([f, d]) => ({ folder: f, name: f,
      description: d })), to)),
  'skills.browse': ({ url }: { url: string }) => later(() => {
    if (!/^(https:\/\/|git@)/.test(url.trim())) throw new Error('Use an https:// or git@ address of a git repository')
    return repo
  }, 900),
  'skills.install': ({ cluster, paths, targets: to }: { cluster: string; paths: string[]; targets: string[] }) =>
    later(() => add(cluster, repo.filter((k) => paths.includes(k.path)), to)),
  'skills.remove': ({ cluster, path, target }: { cluster: string; path: string; target: string }) => {
    installed[cluster] = installed[cluster].filter((k) => !(k.path === path && k.target === target))
  },
}
