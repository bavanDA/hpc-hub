import { Segments } from '../e/ui'
import { BIG, type How } from './copyPlan'
import { CopyStep } from './CopyStep'
import { NOTE } from './noteClass'

type Props = { dstName: string; same: boolean; how: How; onHow: (how: How) => void; files: number; missing: string }

export function CopyHow({ dstName, same, how, onHow, files, missing }: Props) {
  if (same) {
    return <p className={NOTE}>{dstName} copies it from folder to folder itself. Copying again only sends
      what changed, and the files count for the group whose folder they land in.</p>
  }
  const sync = how === 'globus'
  return (
    <CopyStep title="How">
      <div className="px-5">
        <Segments label="How" value={how} onChange={onHow}
          options={[['globus', 'Globus'], ['laptop', 'Through this laptop']] as const} />
      </div>
      <p className={NOTE}>
        {sync ? 'Cluster to cluster, for big projects. Copying again only sends what changed.'
          : 'Simple, fine for smaller projects.'}
        {!sync && files > BIG && ' That is big: Globus is much faster.'}</p>
      {missing && <p className={`${NOTE} text-bad`}>Globus needs {missing} first. Set it up in Files, Transfers.</p>}
    </CopyStep>
  )
}
