export const PICKS = [['cheapest', 'Cheapest'], ['fastest', 'Fastest']] as const

export const pickNote = (pick: string | undefined, wait = 60) => pick === 'fastest'
  ? 'Takes the queue that starts soonest right now, even one that costs SUs.'
  : `Takes the free queue first, unless it would make you wait more than ${wait < 120 ? `${wait} seconds`
    : `${Math.round(wait / 60)} minutes`}; then the one that starts soonest.`
