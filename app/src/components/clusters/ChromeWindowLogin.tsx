import type { Question } from '../../types/clusters'
import { EButton } from '../e/EButton'
import { EDialog } from '../e/EDialog'
import { SignInWaiting } from './SignInWaiting'

/** Signing in in our own Chrome window: the backend sees the sign-in at once and closes the window. */
export function ChromeWindowLogin({ q, onAnswer }: { q: Question; onAnswer: (a: string | null) => void }) {
  const cancel = () => onAnswer(null)
  return (
    <EDialog title={q.title ?? `${q.name} VPN sign-in`} onClose={cancel} width={460} actions={<>
      <EButton onClick={cancel}>Stop signing in</EButton>
      <EButton className="flex-1" onClick={() => onAnswer('in-app')}>Sign in in the app instead</EButton>
    </>}>
      <SignInWaiting title="Sign in in the Chrome window"
        text="Sign in and approve Duo in the Chrome window that opened. It closes by itself once you are signed in." />
    </EDialog>
  )
}
