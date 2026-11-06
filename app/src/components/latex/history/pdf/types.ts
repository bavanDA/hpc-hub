import type { Row } from '../../../../types/history'
import { open } from '../../../pdf/engine'

export type PdfMark = { page: number; y: number; words: string[]; path: string; line: number; before: Row | null; after: Row }
export type Group = { page: number; y: number; targets: PdfMark[] }
export type PinAt = { id: string; n: number; page: number; y: number; done: boolean; text: string }
/** A right-click on a page: where (PDF points from the page's top), the text around it, and where on screen. */
export type Click = { page: number; x: number; y: number; text: string; cx: number; cy: number }
export type Doc = Awaited<ReturnType<typeof open>['promise']>
export type Box = { x: number; y: number; w: number; h: number }
export type Drawn = { boxes: Box[]; bar: Box | null; target: PdfMark }
