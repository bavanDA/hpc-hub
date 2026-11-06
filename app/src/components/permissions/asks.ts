const ASKS: Record<string, string> = { scancel: 'Before cancelling jobs', force_push: 'Before a force push',
  discard: 'Before throwing away unsaved changes' }

export const askLabel = (key: string, label: string) => ASKS[key] ?? label.replace(/\s*\(.*\)$/, '')
