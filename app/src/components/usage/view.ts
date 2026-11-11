export type View = 'overview' | 'su' | 'storage' | 'load' | 'limits'
export type OpenView = (cluster: string, view: View, account?: string) => void
