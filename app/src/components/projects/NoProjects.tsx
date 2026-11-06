import { Folder, FolderOpen, Plus } from 'lucide-react'

import { EButton, EmptyState } from '../e/extra'

export function NoProjects({ onAdd, onCreate }: { onAdd: () => void; onCreate: () => void }) {
  return (
    <div className="grid h-full place-items-center">
      <EmptyState icon={Folder} title="No projects yet"
        text="Add a folder you already have on a cluster, or make a new one. Then open it in Code, VS Code, an
          agent or Files with one click."
        action={<>
          <EButton icon={FolderOpen} onClick={onAdd}>Add a folder you have</EButton>
          <EButton kind="primary" icon={Plus} onClick={onCreate}>New project</EButton>
        </>} />
    </div>
  )
}
