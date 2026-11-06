import { autocompletion, type Completion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete'
import type { Extension } from '@codemirror/state'
import { Decoration, type DecorationSet, type EditorView, MatchDecorator, ViewPlugin, type ViewUpdate } from '@codemirror/view'

/** The options people use most, with what they mean in plain words. */
const SBATCH_FLAGS: { flag: string; info: string; value?: string }[] = [
  { flag: 'job-name', info: 'Name shown in Jobs', value: 'myjob' },
  { flag: 'partition', info: 'Queue to run in' },
  { flag: 'time', info: 'Longest it may run (D-HH:MM:SS)', value: '01:00:00' },
  { flag: 'mem', info: 'Memory for each node', value: '16G' },
  { flag: 'mem-per-cpu', info: 'Memory for each core', value: '4G' },
  { flag: 'cpus-per-task', info: 'Cores for each task', value: '4' },
  { flag: 'ntasks', info: 'How many tasks (MPI ranks)', value: '1' },
  { flag: 'ntasks-per-node', info: 'Tasks on each node', value: '1' },
  { flag: 'nodes', info: 'How many nodes', value: '1' },
  { flag: 'gres', info: 'GPUs and other devices', value: 'gpu:1' },
  { flag: 'gpus', info: 'How many GPUs', value: '1' },
  { flag: 'account', info: 'Group to bill' },
  { flag: 'qos', info: 'Priority and billing' },
  { flag: 'output', info: 'File for the output (%j is the job id)', value: '%x-%j.out' },
  { flag: 'error', info: 'File for the errors', value: '%x-%j.err' },
  { flag: 'array', info: 'Run as an array of jobs', value: '1-10' },
  { flag: 'mail-type', info: 'When to send email', value: 'END,FAIL' },
  { flag: 'mail-user', info: 'Where to send email' },
  { flag: 'chdir', info: 'Folder to start in' },
  { flag: 'constraint', info: 'Only nodes with this feature' },
  { flag: 'exclusive', info: 'Whole nodes, not shared' },
  { flag: 'dependency', info: 'Start after another job', value: 'afterok:' },
]

const directive = new MatchDecorator({
  regexp: /^(#SBATCH)(\s+--?[\w-]+)?(=|\s+)?(\S*)/gm,
  decorate: (add, from, _to, m) => {
    add(from, from + m[1].length, Decoration.mark({ class: 'cm-sbatch' }))
    let at = from + m[1].length
    if (m[2]) {
      add(at, at + m[2].length, Decoration.mark({ class: 'cm-sbatch-flag' }))
      at += m[2].length
    }
    if (m[3]) at += m[3].length
    if (m[4]) add(at, at + m[4].length, Decoration.mark({ class: 'cm-sbatch-value' }))
  },
})

const marks = ViewPlugin.fromClass(class {
  decorations: DecorationSet
  constructor(view: EditorView) { this.decorations = directive.createDeco(view) }
  update(u: ViewUpdate) { this.decorations = directive.updateDeco(u, this.decorations) }
}, { decorations: (p) => p.decorations })

function source(partitions: () => string[]) {
  return (ctx: CompletionContext): CompletionResult | null => {
    const line = ctx.state.doc.lineAt(ctx.pos)
    const before = line.text.slice(0, ctx.pos - line.from)
    if (!/^#SBATCH\b/.test(before)) return null
    const part = before.match(/(?:--partition[=\s]|-p\s+)([\w-]*)$/)
    if (part) {
      const options: Completion[] = partitions().map((p) => ({ label: p, type: 'enum', detail: 'queue' }))
      return options.length ? { from: ctx.pos - part[1].length, options, validFor: /^[\w-]*$/ } : null
    }
    const flag = before.match(/--([\w-]*)$/)
    if (!flag) return null
    return {
      from: ctx.pos - flag[1].length,
      options: SBATCH_FLAGS.map((f) => ({ label: f.flag, detail: f.info, type: 'property',
        apply: f.flag === 'exclusive' ? f.flag : `${f.flag}=${f.value ?? ''}` })),
      validFor: /^[\w-]*$/,
    }
  }
}

/** #SBATCH lines stand out, and "#SBATCH --" offers the common options, with the queues after --partition.
 *  partitions is asked each time, so it can fill in after the file opens. */
export function slurm(opts: { partitions?: () => string[] } = {}): Extension {
  return [marks, autocompletion({ override: [source(opts.partitions ?? (() => []))], icons: false })]
}
