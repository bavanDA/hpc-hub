// The one-time code the phone shows before it scans (hpc_hub/core/pairing.py normalize): the desktop seals the QR
// code with it, so a photo of the screen alone gives nothing away. Checked here to say a mistyped code at once.

export const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'  // Crockford's base32: no I, L, O or U
export const LENGTH = 10

/** The code as typed (any case, with spaces or dashes, O for 0, I or L for 1): its ten characters, or what's wrong. */
export function phoneCode(typed: string): { code: string; error?: undefined } | { code?: undefined; error: string } {
  const raw = typed.replace(/[\s\-‐-―−]/g, '').toUpperCase()
    .replace(/O/g, '0').replace(/[IL]/g, '1')
  if (raw.length !== LENGTH) {
    return { error: `The phone code has ${LENGTH} letters and digits, like 7K2QM-X9D4R, and this one has `
      + `${raw.length}. It is on the phone, after you tap Scan from your computer.` }
  }
  const bad = [...new Set([...raw].filter((ch) => !ALPHABET.includes(ch)))].sort()
  if (bad.length) return { error: `The phone code has no ${bad.join(', ')}. Check it on the phone and type it again.` }
  return { code: raw }
}
