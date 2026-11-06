import type { KeyTest } from '../../types/clusters'
import { TONE } from './keyTone'

/** What the key test said, plain text with its icon; red when it failed. */
export function KeyTestResult({ test, text }: { test: KeyTest; text: string }) {
  const [look, Icon] = TONE[test.kind ?? (test.ok ? 'ok' : 'error')]
  return (
    <div role="status" className={`flex gap-2.5 ${look}`}>
      <Icon size={16} className="mt-[2px] shrink-0" /><span>{text}</span>
    </div>
  )
}
