export type NextStep = 'wait' | 'attach' | 'offer' | 'gone'

/** After a session tab's connection ended. code 0 is the person leaving (detach, exit), so it isn't undone. A tab that
 *  had only just started failed by itself, and attaching again would only loop. */
export function nextStep(reachable: boolean, stillThere: boolean, code: number, ranFor: number): NextStep {
  if (!reachable) return 'wait'
  if (!stillThere) return 'gone'
  return code !== 0 && ranFor >= 5000 ? 'attach' : 'offer'
}
