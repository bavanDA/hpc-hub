// GitHub turned down git's sign-in (kind "github-auth"): a short guide to sign in with gh, GitHub's own tool, which
// the Papers' git then uses for github.com. The sign-in runs in a terminal on the cluster (signIn.ts).

export const GITHUB_AUTH = 'github-auth'

/** How gh is on the cluster: not installed, not signed in, or signed in as an account with no access. */
export type GhState = 'missing' | 'signed-out' | 'no-access'
export type GhDetails = { gh: GhState; account: string; repo: string }
export type GhGuide = { title: string; steps: string[]; button: string; setupGit: string }

const STATES: GhState[] = ['missing', 'signed-out', 'no-access']

/** The details of a github-auth error; null for any other error. */
export function ghDetails(kind?: string, details?: unknown): GhDetails | null {
  if (kind !== GITHUB_AUTH) return null
  const d = (details && typeof details === 'object' ? details : {}) as Record<string, unknown>
  const gh = STATES.includes(d.gh as GhState) ? d.gh as GhState : 'signed-out'
  return { gh, account: typeof d.account === 'string' ? d.account : '',
    repo: typeof d.repo === 'string' ? d.repo : '' }
}

const CODE = 'gh shows a one-time code: open github.com/login/device in your browser, type the code and approve.'
const BACK = 'Come back here and press Try again.'

export function ghGuide(d: GhDetails): GhGuide {
  const repo = d.repo || 'this repository'
  const setupGit = 'Optional: run gh auth setup-git in a terminal on the cluster, and the git you run yourself uses '
    + 'gh for github.com too (it adds gh to ~/.gitconfig). HPC Hub uses gh without it.'
  if (d.gh === 'missing') {
    return { title: 'Sign in to GitHub with gh', button: 'Install gh and sign in', setupGit, steps: [
      `GitHub turned down the sign-in git has on the cluster for ${repo}.`,
      "HPC Hub can install gh, GitHub's own tool, in your home folder (no root needed), then start its sign-in "
        + 'in a terminal.',
      CODE, BACK] }
  }
  if (d.gh === 'signed-out') {
    return { title: 'Sign in to GitHub with gh', button: 'Sign in with GitHub (gh)', setupGit, steps: [
      `GitHub turned down the sign-in git has on the cluster for ${repo}. gh is installed, but not signed in.`,
      'Sign in with gh in a terminal: HPC Hub then uses it for github.com.', CODE, BACK] }
  }
  const who = d.account || 'your account'
  return { title: `${who} has no access to ${repo}`, button: 'Sign in with GitHub (gh)', setupGit, steps: [
    `gh is signed in to GitHub as ${who}, and GitHub says ${who} can't reach ${repo}.`,
    `Ask the owner of ${repo} to add ${who} (with write access, to push), then press Try again.`,
    'Or sign in with gh as the account that has access.'] }
}
