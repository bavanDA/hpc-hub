import { initials } from '../format'

export function Avatar({ name, size = 22, faint = false }: { name: string; size?: number; faint?: boolean }) {
  return (
    <span style={{ width: size, height: size, fontSize: size * 0.42 }} title={name}
      className={`grid shrink-0 place-items-center rounded-full border border-line-strong font-semibold
        ${faint ? 'text-faint' : 'text-dim'}`}>{initials(name)}</span>
  )
}
