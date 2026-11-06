export const inRange = (v: number, min: number, max?: number | null) => v >= min && (!max || v <= max)

/** Minutes as whole days, hours and minutes. */
export const dhm = (total: number) => [Math.floor(total / 1440), Math.floor((total % 1440) / 60), total % 60] as const
