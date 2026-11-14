import { Folder, FolderOpen, Laptop, Plus } from 'lucide-react'

import { EButton } from '../e/EButton'
import { EmptyState } from '../e/EmptyState'

export function NoProjects({ onAdd, onCreate, onFromLaptop }:
  { onAdd: () => void; onCreate: () => void; onFromLaptop?: () => void }) {
  return (
    <div className="grid h-full place-items-center">
      <EmptyState icon={Folder} title="No projects yet"
        text={`Add a folder you already have on a cluster${onFromLaptop ? ', bring one from this computer with its'
          + ' Claude chats,' : ''} or make a new one. Then open it in Code, VS Code, an agent or Files with one click.`}
        action={<>
          <EButton icon={FolderOpen} onClick={onAdd}>Add a folder you have</EButton>
          {onFromLaptop && <EButton icon={Laptop} onClick={onFromLaptop}>From this computer</EButton>}
          <EButton kind="primary" icon={Plus} onClick={onCreate}>New project</EButton>
        </>} />
    </div>
  )
}
