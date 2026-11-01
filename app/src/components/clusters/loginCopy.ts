// Every sentence the login screens say about passwords and SSH keys, in one place so the wording can change in
// one go. Python's are in hpc_hub/core/login_copy.py (also the login test's answers); keep the two alike.
import type { Cluster } from '../../types/clusters'

type Named = Pick<Cluster, 'name' | 'org'>

/** "Wulver" for "Wulver (NJIT)". */
export const shortName = (c: Pick<Cluster, 'name'>) => c.name.split(' (')[0]
/** "Yale": the org, else the short name. */
export const who = (c: Named) => c.org || shortName(c)
/** Where "What's an SSH key?" goes: the cluster's own guide, else GitHub's. */
export const keyHelp = (c: Pick<Cluster, 'key_help'>) =>
  c.key_help || 'https://docs.github.com/en/authentication/connecting-to-github-with-ssh/about-ssh'

export const copy = {
  signIn: (c: Named) => `Sign in to ${shortName(c)}`,
  usernameHint: 'e.g. ab123',
  remember: 'Remember password',

  // a cluster that takes only passwords (Wulver)
  passwordHelp: (c: Named & Pick<Cluster, 'username_label'>) => `Your ${who(c)} ${c.username_label ?? ''} password.`,
  passwordNote: (c: Named, store: string) =>
    `${shortName(c)} doesn't accept SSH keys, so HPC Hub signs in with your password. It's saved encrypted in ` +
    `${store}, the way a browser saves passwords.`,
  passwordDuo: 'After you sign in, approve the Duo push on your phone.',
  savedIn: (store: string) => `Saved encrypted in ${store}.`,

  // a cluster you log in to with a key you paste on its key page (Yale)
  keyIntro: (c: Named) => `To sign in to ${shortName(c)}, you need an SSH key.`,
  whatsAKey: "What's an SSH key?",
  stepKey: 'Your SSH key',
  noKey: "If you don't have one, HPC Hub can make one.",
  createKey: 'Create SSH key',
  haveKey: (file: string) => `This computer has an SSH key (${file}).`,
  stepAdd: (c: Named) => `Add it to ${who(c)}`,
  copyKey: 'Copy public key',
  copied: 'Copied',
  pasteIt: (c: Named) => `Paste it on ${who(c)}'s SSH key page.`,
  openPage: (c: Named) => `Open ${who(c)} SSH key page`,
  addedIt: 'I added it',
  added: (c: Named) => `Added on ${who(c)}'s SSH key page.`,
  stepTest: 'Test your login',
  keyDuo: (c: Named) => `${shortName(c)} also sends a Duo push to your phone.`,
  testButton: 'Test login',
  change: 'Change',
  usePassword: 'Use a password instead',
  useKey: 'Use an SSH key instead',
}
