// Every sentence the login screens say about passwords and SSH keys, in one place so the wording can change in
// one go. Python's are in hpc_hub/core/login_copy.py (also the login test's answers); keep the two alike.
import type { Cluster } from '../../types/clusters'

/** "Wulver" for "Wulver (NJIT)". */
export const shortName = (c: Pick<Cluster, 'name'>) => c.name.split(' (')[0]
/** "Yale": the org, else the short name. */
export const who = (c: Pick<Cluster, 'name' | 'org'>) => c.org || shortName(c)

export const copy = {
  // a cluster that takes only passwords (Wulver)
  passwordNote: (c: Pick<Cluster, 'name'>) =>
    `${shortName(c)} only takes passwords, not SSH keys. HPC Hub keeps yours encrypted on this computer.`,
  savedIn: (store: string) => `Saved encrypted in ${store}.`,

  // a cluster you log in to with a key you paste on its key page (Yale)
  keyIntro: (c: Pick<Cluster, 'name' | 'org'>) => `${who(c)} uses an SSH key instead of a password.`,
  whatsAKey: "What's an SSH key?",
  keyExplained: (c: Pick<Cluster, 'name' | 'org'>) =>
    `A file on your computer that proves it's you. ${who(c)} gets the public half. ` +
    'The private half never leaves this computer.',
  stepMake: 'Make a key',
  haveKey: (kind: string, made: string) => `You have a key (${kind}, ${made})`,
  makeButton: 'Make my key',
  stepCopy: 'Copy it',
  copyButton: 'Copy',
  copied: 'Copied',
  stepPaste: (c: Pick<Cluster, 'name' | 'org'>) => `Paste it on ${who(c)}'s key page`,
  openPage: 'Open key page',
  stepUser: 'Your username',
  testButton: 'Test login',
  usePassword: 'Use a password instead',
  useKey: 'Use an SSH key instead',
}
