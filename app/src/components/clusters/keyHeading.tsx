import type { ReactNode } from 'react'

import type { Cluster } from '../../types/clusters'
import { KeyHelpLink } from './KeyHelpLink'
import { copy } from './loginCopy'

/** The screen's title and the line under it, for the page around the panel. */
export function keyHeading(c: Cluster): { title: string; text: ReactNode } {
  return { title: copy.signIn(c), text: <>{copy.keyIntro(c)} <KeyHelpLink cluster={c} /></> }
}
