// 2026-11-25, owner: "can add download pdf option as well".
import { describe, expect, it } from 'vitest'

import phoneLocal from '../../../../mobile/src/parts/files/local.ts?raw'
import phonePaper from '../../../../mobile/src/parts/papers/Paper.tsx?raw'
import phoneBar from '../../../../mobile/src/parts/papers/ProjectBar.tsx?raw'
import build from './BuildButton.tsx?raw'
import pane from './PdfPane.tsx?raw'
import { downloadState, fileOf, pdfName, savedMessage } from './pdfDownload'
import project from './Project.tsx?raw'
import hook from './usePdfDownload.ts?raw'

describe('the downloaded PDF is named', () => {
  it('after the project folder when the main file is main.tex', () => {
    expect(pdfName('/home/jdoe/thesis', '/home/jdoe/thesis/main.tex')).toBe('thesis.pdf')
    expect(pdfName('/home/jdoe/thesis/', '/home/jdoe/thesis/src/Main.tex')).toBe('thesis.pdf')
  })
  it('after the main file otherwise, as latexmk names it', () => {
    expect(pdfName('/home/jdoe/thesis', '/home/jdoe/thesis/paper.tex')).toBe('paper.pdf')
    expect(pdfName('/home/jdoe/thesis', '/home/jdoe/thesis/my paper.TEX')).toBe('my paper.pdf')
  })
  it('main.pdf when there is no folder name to take', () => {
    expect(pdfName('/', '/main.tex')).toBe('main.pdf')
    expect(pdfName('', 'main.tex')).toBe('main.pdf')
  })
})

describe('Download PDF', () => {
  it('works once there is a built PDF', () => {
    expect(downloadState({ path: '/home/jdoe/thesis/main.pdf' }, false)).toEqual(
      { ok: true, why: 'Download the PDF to this computer' })
  })
  it('says why not before the first build, while loading, on a read error and while compiling', () => {
    expect(downloadState({ none: true }, false)).toEqual(
      { ok: false, why: 'No PDF yet: press Recompile to build it first' })
    expect(downloadState({}, false).ok).toBe(false)
    expect(downloadState({ error: 'Permission denied' }, false)).toEqual(
      { ok: false, why: 'Could not read the PDF: Permission denied' })
    expect(downloadState({ path: '/home/jdoe/thesis/main.pdf' }, true).ok).toBe(false)  // a half-written PDF
  })
})

describe('where it went', () => {
  it('reads Linux, macOS and Windows paths', () => {
    expect(fileOf('/home/jdoe/Downloads/HPC Hub/wulver/thesis (1).pdf')).toBe('thesis (1).pdf')
    expect(fileOf('C:\\Users\\jdoe\\Downloads\\HPC Hub\\wulver\\thesis.pdf')).toBe('thesis.pdf')
    expect(savedMessage('/Users/jdoe/Downloads/HPC Hub/wulver/thesis.pdf'))
      .toBe('Saved thesis.pdf to /Users/jdoe/Downloads/HPC Hub/wulver')
    expect(savedMessage('C:\\Users\\jdoe\\Downloads\\HPC Hub\\wulver\\thesis.pdf'))
      .toBe('Saved thesis.pdf to C:\\Users\\jdoe\\Downloads\\HPC Hub\\wulver')
    expect(savedMessage('thesis.pdf')).toBe('Saved thesis.pdf')
  })
})

describe('the menu item and the toolbar button', () => {
  it('Download PDF is in the Recompile menu and the PDF toolbar', () => {
    expect(build).toContain('<span className="block">Download PDF</span>')
    expect(build).toContain('disabled={!pdf.ok} title={pdf.why}')
    expect(pane).toContain("<Tool label={download.ok ? 'Download PDF' : download.why} disabled={!download.ok}")
    expect(project).toContain('pdf={download}')
    expect(project).toContain('download={download}')
  })
  it('saves with files.download into Downloads/HPC Hub, never over a file, and offers Show in folder', () => {
    expect(hook).toContain("call<{ id: string; path: string }>('files.download'")
    expect(hook).toContain('local_dir: await openFolder(cluster), name: pdfName(folder, main)')
    expect(hook).toContain("label: 'Show in folder'")
    expect(hook).toContain("call('files.show_here', { path })")
  })
})

describe('on the phone', () => {
  it("Download PDF is in Recompile's menu and saves thesis.pdf in Downloads/HPC Hub", () => {
    expect(phoneBar).toContain("{ label: 'Download PDF', icon: Download, onClick: onDownloadPdf }")
    expect(phonePaper).toContain("download(cluster, pdf.path, 'save', pdfName(folder, main))")
    expect(phonePaper).toContain('else toast(can.why)')
    expect(phoneLocal).toContain('local_dir: CACHE, name: as')
  })
})
