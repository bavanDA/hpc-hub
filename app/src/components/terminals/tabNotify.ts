let notify: (text: string) => void = () => {}

export const setNotify = (fn: (text: string) => void) => { notify = fn }
export const tabNotify = (text: string) => notify(text)
