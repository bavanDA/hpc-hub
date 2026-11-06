import type { Project } from '../../../types/projects'

/** path is folder or a file or folder in it. */
export const inside = (path: string, folder: string) =>
  !!folder && (path === folder || path.startsWith(folder.replace(/\/+$/, '') + '/'))

/** /home/jdoe/x as ~/x. */
export const tilde = (path: string, home: string) => (home && inside(path, home) ? '~' + path.slice(home.length) : path)

export const folderName = (path: string, home: string, projects: Project[]) =>
  projects.find((p) => p.path === path)?.name ?? (path === home ? 'Home' : path.split('/').filter(Boolean).pop() ?? '/')
