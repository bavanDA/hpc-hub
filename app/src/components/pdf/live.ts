import type { engine } from './engine'

type Engine = Awaited<ReturnType<typeof engine>>

/** A pdf.js viewer once it is made, with the document it shows. */
export type Live = {
  lib: Engine['lib']
  viewer: InstanceType<Engine['viewer']['PDFViewer']>
  bus: InstanceType<Engine['viewer']['EventBus']>
  link: InstanceType<Engine['viewer']['PDFLinkService']>
  doc: Awaited<ReturnType<Engine['lib']['getDocument']>['promise']> | null
}
