/** Who to write to when copies don't match: the help desk the cluster publishes, if it does. */
export const helpFor = (email?: string) => email || 'your cluster\'s help desk'
