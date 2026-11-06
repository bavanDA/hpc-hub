/** The step's buttons, under its rows: the main one solid. */
export function Actions({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2 px-5 pt-5">{children}</div>
}
