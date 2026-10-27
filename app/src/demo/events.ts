// Events for demo answers that push, like the backend's hub().emit: rpc.ts hands them to on().
let deliver: (name: string, data: unknown) => void = () => {}

export const demoEmit = (name: string, data: unknown) => deliver(name, data)
export const onDemoEvent = (fn: (name: string, data: unknown) => void) => { deliver = fn }
