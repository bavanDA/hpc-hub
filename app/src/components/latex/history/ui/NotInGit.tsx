import { History as HistoryIcon } from 'lucide-react'

import { Center } from './Center'

export function NotInGit() {
  return <Center><HistoryIcon size={36} strokeWidth={1.25} className="text-dim" />
    <p className="font-semibold">This paper is not in git yet</p>
    <p className="max-w-sm text-center text-sm text-dim">Its history shows here once the folder is a git repository,
      for example after cloning it from GitHub or GitLab.</p></Center>
}
