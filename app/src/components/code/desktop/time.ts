/** A moment as the time of day, like 3:05 PM. */
export const time = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
