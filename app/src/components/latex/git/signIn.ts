// gh's sign-in runs in a terminal on the cluster, to see gh's one-time code
import type { Go } from '../../../nav'
import { call } from '../../../rpc'
import type { Started } from '../../../types/tools'
import { addBanner } from '../../terminals/banners'
import { openTmux } from '../../terminals/tabs'

/** gh's sign-in (installing gh first when it isn't there) in a terminal on the login node. */
export async function signInWithGh(cluster: string, go: Go): Promise<void> {
  const c = await call<Started>('latex.gh_sign_in', { cluster })
  const key = openTmux(cluster, c)
  addBanner(key, 'Signed in? Go back to the paper and press Try again.', 'Back to the paper', () => go('latex'))
  go('terminals')
}
