type Kind = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-solid'
// suggested and flat: older names for primary and ghost
type ButtonKind = Kind | 'suggested' | 'flat'
type ButtonSize = 'sm' | 'md' | 'lg'

const KIND: Record<ButtonKind, Kind> = {
  primary: 'primary', secondary: 'secondary', ghost: 'ghost', danger: 'danger', 'danger-solid': 'danger-solid',
  suggested: 'primary', flat: 'ghost',
}
const LOOK: Record<Kind, string> = {
  primary: 'bg-accent text-on-accent hover:bg-accent-hover active:bg-accent-pressed disabled:opacity-40',
  secondary: 'border border-line-strong text-text hover:bg-hover active:bg-pressed disabled:opacity-45',
  ghost: 'text-text hover:bg-hover active:bg-pressed disabled:opacity-45',
  danger: 'border border-line-strong text-bad hover:bg-bad-bg active:bg-bad-bg disabled:opacity-45',
  'danger-solid': 'bg-bad-fill text-white hover:brightness-95 active:brightness-90 disabled:opacity-45',
}
const SIZE: Record<ButtonSize, string> = {
  sm: 'h-8 gap-1.5 rounded-md px-3 text-sm',
  md: 'h-9 gap-2 rounded-lg px-3.5 text-base',
  lg: 'h-11 gap-2 rounded-lg px-5 text-base',
}

/** pill: the big call to action of the first start. */
export function Button({ kind = 'secondary', size = 'md', pill = false, className = '', ...props }:
  { kind?: ButtonKind; size?: ButtonSize; pill?: boolean }
  & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const shape = pill ? 'h-11 gap-2 rounded-lg px-6 text-md' : SIZE[size]
  return (
    <button {...props}
      className={`inline-flex shrink-0 items-center justify-center whitespace-nowrap font-semibold transition-colors
        duration-90 ${shape} ${LOOK[KIND[kind]]} ${className}`} />
  )
}
