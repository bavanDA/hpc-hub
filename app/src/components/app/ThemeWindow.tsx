import type { Theme } from './ThemePicker'

export function ThemeWindow({ colors: [win, side, line, text, button], className = '' }:
  { colors: Theme['sample']; className?: string }) {
  const bar = (w: string, o = 1) =>
    <span className="block h-[3px] rounded-full" style={{ width: w, background: text, opacity: o }} />
  return (
    <span className={`absolute inset-0 flex ${className}`} style={{ background: win }}>
      <span className="flex w-[30%] flex-col gap-[5px] px-[7px] pt-[9px]" style={{ background: side }}>
        {bar('80%', 0.7)}{bar('60%', 0.45)}{bar('70%', 0.45)}
      </span>
      <span className="flex flex-1 flex-col">
        {['85%', '65%'].map((w) => (
          <span key={w} className="flex flex-col gap-[4px] px-[8px] py-[7px]"
            style={{ borderBottom: `1px solid ${line}` }}>
            {bar(w, 0.85)}{bar('40%', 0.4)}
          </span>
        ))}
        <span className="mt-auto mr-[8px] mb-[8px] ml-auto block h-[9px] w-[30px] rounded-[3px]"
          style={{ background: button }} />
      </span>
    </span>
  )
}
