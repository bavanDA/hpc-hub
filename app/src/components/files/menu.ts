import type { Entry } from '../../types/files'
import type { MenuItem } from './ContextMenu'
import { isArchive, isText } from './format'

type MenuActions = {
  open: () => void; edit: () => void; copyPath: () => void; download: () => void; rename: () => void
  zip: () => void; copy: () => void; move: () => void; delete: () => void; newFolder: () => void
  upload: () => void; paste: () => void
  vscode?: () => void  // in the folder (a file: its folder)
  claude?: () => void
  code?: () => void    // the folder (a file: its folder) in the Code page's tree
}

/** VS Code and Claude in the folder. */
function tools(a: MenuActions, labels: [string, string]): MenuItem[] {
  return [...(a.vscode ? [{ label: labels[0], onClick: a.vscode }] : []),
    ...(a.claude ? [{ label: labels[1], onClick: a.claude }] : [])]
}

/** The right-click menu: on the folder (entry null), on one entry, or on several picked ones (count). */
export function menuFor(entry: Entry | null, canPaste: boolean, a: MenuActions, count = 1): MenuItem[][] {
  if (entry && count > 1) {
    return [
      [{ label: `Download ${count} items`, onClick: a.download },
        { label: 'Copy, then paste on any cluster', onClick: a.copy },
        { label: 'Move, then paste in another folder', onClick: a.move }],
      [{ label: `Delete ${count} items…`, onClick: a.delete, danger: true }],
    ]
  }
  if (!entry) {
    return [
      [{ label: 'New folder…', onClick: a.newFolder }, { label: 'Upload files here…', onClick: a.upload },
        ...(canPaste ? [{ label: 'Paste here', onClick: a.paste }] : [])],
      [...tools(a, ['Open this folder in VS Code', 'Claude in this folder']),
        ...(a.code ? [{ label: 'Open this folder in Code', onClick: a.code }] : []),
        { label: 'Copy path', onClick: a.copyPath }],
    ]
  }
  const dir = entry.kind === 'd'
  return [
    [{ label: 'Open', onClick: a.open }, ...(isText(entry) ? [{ label: 'Edit in Code', onClick: a.edit }] : []),
      ...(dir && a.code ? [{ label: 'Open in Code', onClick: a.code }] : [])],
    [...tools(a, dir ? ['Open in VS Code', 'Claude here'] : ['Open its folder in VS Code', 'Claude in its folder']),
      { label: 'Copy path', onClick: a.copyPath }],
    [{ label: 'Download', onClick: a.download }, { label: 'Rename…', onClick: a.rename },
      { label: isArchive(entry) ? 'Extract here' : 'Make a zip', onClick: a.zip },
      { label: 'Copy, then paste on any cluster', onClick: a.copy },
      { label: 'Move, then paste in another folder', onClick: a.move }],
    [{ label: 'Delete…', onClick: a.delete, danger: true }],
  ]
}
