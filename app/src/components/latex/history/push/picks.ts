import type { Pick, Spot } from '../../../../types/history'

export const spotKey = (s: Spot) => `${s.path}#${s.index}`
export function pickLabel(take: Pick['take'], theirs: string) {
  return take === 'mine' ? 'Keep mine' : take === 'theirs' ? `Keep ${theirs}'s` : take === 'both' ? 'Keep both' : 'Edit'
}
