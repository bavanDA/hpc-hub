import type { Listing } from '../../types/terminals'

export type NextStep = 'wait' | 'attach' | 'offer' | 'gone' | 'unsure'

/** After a session tab's connection ended. code 0 is the person leaving (detach, exit), so it isn't undone. A tab that
 *  had only just started failed by itself, and attaching again would only loop. looked: the session's place (its
 *  node, or the login node) answered the listing; when it didn't, missing from the list isn't ended ('unsure'). */
export function nextStep(reachable: boolean, looked: boolean, stillThere: boolean, code: number,
  ranFor: number): NextStep {
  if (!reachable) return 'wait'
  if (stillThere) return code !== 0 && ranFor >= 5000 ? 'attach' : 'offer'
  return looked ? 'gone' : 'unsure'
}

/** Whether the listing read the sessions on node ("" the login node). A backend that doesn't say read them all. */
export function lookedAt(listing: Listing, node: string): boolean {
  return listing.read === undefined || listing.read.includes(node)
}
