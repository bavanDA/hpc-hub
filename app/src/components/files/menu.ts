// The right-click menu, in GTK's sections: for a file or folder, or (entry null) for the folder you are in.
import type { Entry } from '../../types/files'
import type { MenuItem } from './ContextMenu'
import { isArchive, isText } from './format'

export type MenuActions = {
  open: () => void; edit: () => void; copyPath: () => void; download: () => void; rename: () => void
  zip: () => void; copy: () => void; delete: () => void; newFolder: () => void; upload: () => void
  paste: () => void
  vscode?: () => void  // in the folder (a file: its folder)
  claude?: () => void
}

/** VS Code and Claude in the folder, as in hpc_hub/files/ui/menu.py. */
function tools(a: MenuActions, labels: [string, string]): MenuItem[] {
  return [...(a.vscode ? [{ label: labels[0], onClick: a.vscode }] : []),
    ...(a.claude ? [{ label: labels[1], onClick: a.claude }] : [])]
}

export function menuFor(entry: Entry | null, canPaste: boolean, a: MenuActions): MenuItem[][] {
  if (!entry) {
    return [
      [{ label: 'New folder…', onClick: a.newFolder }, { label: 'Upload files here…', onClick: a.upload },
        ...(canPaste ? [{ label: 'Paste here', onClick: a.paste }] : [])],
      [...tools(a, ['Open this folder in VS Code', 'Claude in this folder']),
        { label: 'Copy path', onClick: a.copyPath }],
    ]
  }
  const dir = entry.kind === 'd'
  return [
    [{ label: 'Open', onClick: a.open }, ...(isText(entry) ? [{ label: 'Edit', onClick: a.edit }] : [])],
    [...tools(a, dir ? ['Open in VS Code', 'Claude here'] : ['Open its folder in VS Code', 'Claude in its folder']),
      { label: 'Copy path', onClick: a.copyPath }],
    [{ label: 'Download', onClick: a.download }, { label: 'Rename…', onClick: a.rename },
      { label: isArchive(entry) ? 'Extract here' : 'Make a zip', onClick: a.zip },
      { label: 'Copy, then paste on any cluster', onClick: a.copy }],
    [{ label: 'Delete…', onClick: a.delete, danger: true }],
  ]
}
