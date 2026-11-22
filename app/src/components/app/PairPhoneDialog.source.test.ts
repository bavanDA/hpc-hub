// Phone pairing's wiring on both sides, read from the source (these tests run without a page or a phone).
import { describe, expect, it } from 'vitest'

import form from '../../../../mobile/src/parts/clusters/LoginForm.tsx?raw'
import scan from '../../../../mobile/src/parts/scanPairing.ts?raw'
import welcome from '../../../../mobile/src/parts/Welcome.tsx?raw'
import demo from '../../demo/code_ask.ts?raw'
import dialog from './PairPhoneDialog.tsx?raw'

const before = (text: string, first: string, then: string) => {
  expect(text).toContain(first)
  expect(text).toContain(then)
  expect(text.indexOf(first)).toBeLessThan(text.indexOf(then))
}

// 2026-11-22 review: the QR code held passwords and the phone's SSH key in plain base64, readable from a photo
describe('the desktop asks for the phone code before it makes the QR code', () => {
  it('checks the typed code and stops on a wrong one before pairing.make', () => {
    const show = dialog.slice(dialog.indexOf('async function show'))
    before(show, 'phoneCode(typed)', "call<Made>('pairing.make'")
    before(show, 'if (checked.error !== undefined) { setError(checked.error); return }', "'pairing.make'")
    expect(show).toMatch(/'pairing\.make', \{ code: checked\.code,/)
  })
  it('shows the code field above the clusters, and makes no QR code by itself', () => {
    before(dialog, 'aria-label="Code on the phone"', 'picks.map(')
    expect(dialog).not.toMatch(/void show\(ready\)/)
    expect(dialog).toMatch(/disabled=\{busy \|\| !on\.size \|\| !typed\.trim\(\)\}/)
  })
  it('hides the QR code when it expires, if not before', () => {
    expect(dialog).toContain('Math.min(SHOWN, got.expires - ')
    expect(dialog).toContain('Date.now() / 1000 >= made.expires')
  })
  it('the demo answers with a version 2 code', () => {
    expect(demo).toContain("text: 'hpchub-pair:2:demo'")
  })
})

describe('the phone shows its code before it scans', () => {
  it('gets the code from pairing.start, then scans and applies', () => {
    before(scan, "call<{ code: string }>('pairing.start')", "invoke<string>('scan_qr')")
    before(scan, "invoke<string>('scan_qr')", "call<string[]>('pairing.apply'")
  })
  it('Scan from your computer opens the code; the camera waits for Scan under it', () => {
    const open = form.slice(form.indexOf('async function open'), form.indexOf('async function scan'))
    expect(open).toContain('await pairingCode()')
    expect(open).not.toContain('scanPairing')
    const shown = form.slice(form.indexOf('const shown'))
    before(shown, '{code}</p>', 'return [open, shown || null]')
    expect(shown).toMatch(/<MainButton icon=\{ScanQrCode\} disabled=\{busy\} onClick=\{scan\}>Scan<\/MainButton>/)
  })
  it('a wrong code keeps the window open with what was wrong', () => {
    expect(form).toContain("if (!names.length) { setNote(msg); return }")
    expect(form).toContain('{note && <p className="text-sm text-bad">{note}</p>}')
  })
  it('both places with the button mount the window', () => {
    for (const page of [form, welcome]) {
      expect(page).toContain('const [scan, scanWindow] = useScan(onScanned)')
      expect(page).toContain('{scanWindow}')
    }
  })
})
