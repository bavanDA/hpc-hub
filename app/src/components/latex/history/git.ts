import { call } from '../../../rpc'

export type Where = { cluster: string; folder: string }

export const git = <T,>(method: string, where: Where, params: Record<string, unknown> = {}) =>
  call<T>(`latex.git_${method}`, { ...where, ...params })
