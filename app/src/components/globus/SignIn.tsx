import { ArrowLeftRight, LogIn } from 'lucide-react'

import { Button, EmptyState } from '../ui'

export function SignIn({ onSignIn }: { onSignIn: () => void }) {
  return (
    <EmptyState icon={ArrowLeftRight} title="Sign in to Globus"
      text="Use your university login. Globus then moves files between clusters for you."
      action={<Button kind="primary" onClick={onSignIn}><LogIn size={16} />Sign in</Button>} />
  )
}
