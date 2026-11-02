// Demo data for the Permissions page: Wulver has the passcode lock, Yale does not, Expanse is not connected.
import type { ClaudePermissions, CommandGroup, LockSetup } from '../types/permissions'

const w = (text: string) => text.split(' ')
const groups: CommandGroup[] = [
  { title: 'Read and search', note: 'Only look at files and the system', commands: w('grep rg head tail cat less ls ' +
    'cd pwd echo printf sed awk cut sort uniq wc nl tr diff cmp comm paste column tac find which type file stat du ' +
    'df realpath readlink basename dirname date seq sleep true test env printenv export source hostname nproc lscpu ' +
    'free ps pgrep ulimit md5sum sha256sum strings ldd od xxd jq tree zcat') },
  { title: 'Files', note: 'Make, copy, move and pack files',
    commands: w('mkdir cp mv ln touch tee chmod rmdir zip unzip tar gzip gunzip xargs timeout') },
  { title: 'Code and builds', note: 'A script can do anything your account can',
    commands: w('python3 python bash sh make cmake gcc g++ nvcc gdb perf') },
  { title: 'LaTeX and PDF', note: '', commands: w('pdflatex latexmk bibtex biber pdftotext pdfinfo pdftoppm') },
  { title: 'Jobs', note: "Submitting uses your group's hours",
    commands: w('squeue sacct sinfo sacctmgr sreport sstat seff sshare sprio scontrol sbatch srun module ml quota') },
  { title: 'Git', note: 'Force push has its own switch below', commands: w('git gh') },
  { title: 'Network', note: 'Download, copy to and sign in to other machines', commands: w('ssh scp rsync curl wget') },
  { title: 'Processes and agents', note: '', commands: w('kill pkill codex claude') },
]
const asks = [{ key: 'scancel', label: 'Cancel jobs', hint: 'scancel' },
  { key: 'force_push', label: 'Force push', hint: 'git push --force' },
  { key: 'discard', label: 'Throw away unsaved changes', hint: 'git reset --hard, git clean -f' }]

const all = groups.flatMap((g) => g.commands)
const noLock = { set_up: false, locked: false, config: {}, open: 0, log: [] }
const perms: Record<string, ClaudePermissions> = {
  wulver: { name: 'Wulver (NJIT)', allowed: [...all.filter((c) => !w('ssh scp kill pkill gdb perf').includes(c)),
    'conda', 'apptainer'], custom: ['apptainer', 'conda'], trash: true, ask: ['force_push', 'scancel'],
  accept_edits: true, groups, asks, lock: { set_up: true, locked: false, open: 1,
    config: { minutes: 10, tries: 3, logout: true, scancel: true },
    log: ['2026-10-24 09:12 code ok, session open for 10 min', '2026-10-23 18:40 wrong code (1 of 3)',
      '2026-10-23 18:41 code ok, session open for 10 min', '2026-10-22 11:05 lock set up'] } },
  yale: { name: 'Yale Bouchet', allowed: groups[0].commands.concat(groups[5].commands), custom: [], trash: true,
    ask: ['discard', 'force_push', 'scancel'], accept_edits: false, groups, asks, lock: noLock },
}

function get({ cluster }: { cluster: string }): ClaudePermissions {
  if (!perms[cluster]) throw new Error('Connect to SDSC Expanse first')
  return perms[cluster]
}

/** Looks like a QR code; scans as nothing. */
function fakeQr(): string {
  let seed = 7
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  const corner = (x: number, y: number) => x < 8 && y < 8 || x > 16 && y < 8 || x < 8 && y > 16
  const cells = []
  for (let y = 0; y < 25; y++) for (let x = 0; x < 25; x++) {
    if (!corner(x, y) && rnd() < 0.5) cells.push(`<rect x="${x + 2}" y="${y + 2}" width="1" height="1"/>`)
  }
  const finder = (x: number, y: number) => `<rect x="${x + 2.5}" y="${y + 2.5}" width="6" height="6" fill="none" ` +
    `stroke="#000"/><rect x="${x + 4}" y="${y + 4}" width="3" height="3"/>`
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 29 29"><rect width="29" height="29" fill="#fff"/>` +
    `${cells.join('')}${finder(0, 0)}${finder(18, 0)}${finder(0, 18)}</svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

const setup: LockSetup = { id: 'demo', key: 'JBSW Y3DP EHPK 3PXP JBSW Y3DP', qr: fakeQr() }

export const answers: Record<string, unknown> = {
  'permissions.get': get,
  'permissions.save': ({ cluster, allowed, trash, ask, accept_edits }: ClaudePermissions & { cluster: string }) => {
    const known = new Set(groups.flatMap((g) => g.commands))
    perms[cluster] = { ...get({ cluster }), allowed, trash, ask, accept_edits,
      custom: allowed.filter((c) => !known.has(c)) }
    return perms[cluster]
  },
  'permissions.lock_start': setup,
  'permissions.lock_finish': null,
  'permissions.lock_cancel': null,
  'permissions.lock_reset': null,
  'permissions.lock_off': null,
}
