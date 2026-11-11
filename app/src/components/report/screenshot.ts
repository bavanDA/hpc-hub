// A picture of the window for a bug report, drawn from the page itself: a copy of the page with its computed styles
// goes into an SVG, the SVG onto a canvas, the canvas out as PNG. No permission and no native code, on every
// platform's webview. Fonts the page loads from files fall back to system ones, and pseudo-elements are left out.

export const SHOT_LIMIT = 2_500_000  // bytes of PNG the report server takes
const MAX_WIDTH = 1600  // pixels: plenty to see a layout, small enough to send

function copy(node: Node, skip: (el: Element) => boolean): Node | null {
  if (node.nodeType === Node.TEXT_NODE) return node.cloneNode()
  if (!(node instanceof Element) || skip(node) || ['SCRIPT', 'NOSCRIPT', 'TEMPLATE'].includes(node.tagName)) return null
  if (node instanceof HTMLCanvasElement) {
    const img = document.createElement('img')
    try { img.src = node.toDataURL() } catch { /* a canvas we may not read: left blank */ }
    img.setAttribute('style', styleOf(node))
    return img
  }
  const out = node.cloneNode(false) as Element
  out.setAttribute('style', styleOf(node))
  if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) out.setAttribute('value', node.value)
  if (node instanceof HTMLTextAreaElement) out.textContent = node.value
  if (node instanceof HTMLInputElement && node.checked) out.setAttribute('checked', '')
  const scrolled = node.scrollTop || node.scrollLeft
  for (const child of node.childNodes) {
    const c = copy(child, skip)
    if (!c) continue
    // the copy can't scroll: move the children instead (translate doesn't change the layout)
    if (scrolled && c instanceof Element) {
      c.setAttribute('style', `${c.getAttribute('style')};translate:${-node.scrollLeft}px ${-node.scrollTop}px`)
    }
    out.appendChild(c)
  }
  return out
}

function styleOf(el: Element): string {
  const s = getComputedStyle(el)
  let out = ''
  for (let i = 0; i < s.length; i++) {
    const name = s[i]
    if (name === 'animation' || name.startsWith('animation-') || name.startsWith('transition')) continue
    out += `${name}:${s.getPropertyValue(name)};`
  }
  return out
}

function draw(svg: string, width: number, height: number, scale: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(width * scale)
      canvas.height = Math.round(height * scale)
      const ctx = canvas.getContext('2d')
      if (!ctx) { reject(new Error('No canvas here')); return }
      ctx.scale(scale, scale)
      ctx.drawImage(img, 0, 0)
      try { resolve(canvas.toDataURL('image/png')) } catch (e) { reject(e as Error) }
    }
    img.onerror = () => reject(new Error('The picture could not be drawn'))
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  })
}

/** Bytes a data URL decodes to. */
export const shotBytes = (url: string) => Math.floor((url.length - url.indexOf(',') - 1) * 3 / 4)

/** The window as a PNG data URL, leaving out what skip says (the report window itself). Throws when this webview
 *  can't draw it. */
export async function captureWindow(skip: (el: Element) => boolean): Promise<string> {
  const width = window.innerWidth
  const height = window.innerHeight
  const body = copy(document.body, skip) as HTMLElement
  const html = document.createElement('html')
  html.setAttribute('class', document.documentElement.className)
  html.setAttribute('style', `${styleOf(document.documentElement)};width:${width}px;height:${height}px;overflow:hidden`)
  html.appendChild(body)
  const markup = new XMLSerializer().serializeToString(html)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`
    + `<foreignObject x="0" y="0" width="100%" height="100%">${markup}</foreignObject></svg>`
  let scale = Math.min(window.devicePixelRatio || 1, MAX_WIDTH / width)
  for (let tries = 0; tries < 4; tries++) {
    const png = await draw(svg, width, height, scale)
    if (shotBytes(png) <= SHOT_LIMIT) return png
    scale *= 0.7
  }
  throw new Error('The screenshot came out too big to send')
}
