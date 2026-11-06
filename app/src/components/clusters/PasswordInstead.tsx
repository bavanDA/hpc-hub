import { copy } from './loginCopy'

/** Below the key panel of a cluster that also takes a password (password_too). */
export function PasswordInstead({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!on)}
      className="self-start text-sm font-semibold underline-offset-2 hover:underline">
      {on ? copy.useKey : copy.usePassword}</button>
  )
}
