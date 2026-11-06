export type View = 'overview' | 'su' | 'storage' | 'load'
export type OpenView = (cluster: string, view: View, account?: string) => void
