// The bug board: reads /report/board with the owner's key. Everything people sent is untrusted text: it is only
// ever put in with textContent, never as HTML.
'use strict'

const $ = (id) => document.getElementById(id)
const KEY = 'hpchub-board-key'
let show = 'open'
let data = null
let typed = '' // when this browser keeps nothing

function key () {
  try { return localStorage.getItem(KEY) || typed } catch { return typed }
}

async function api (path, body) {
  const res = await fetch(path, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${key()}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (res.status === 401) throw Object.assign(new Error('That key was not right.'), { locked: true })
  const out = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(out.error || `The server said ${res.status}`)
  return out
}

function el (tag, cls, text) {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text !== undefined) e.textContent = text
  return e
}

const when = (t) => t ? new Date(t * 1000).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : ''
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

function chips (box, pairs, prefix) {
  box.replaceChildren()
  for (const [value, n] of pairs) {
    const c = el('span', 'chip')
    c.append(`${prefix}${value} `, el('b', '', `×${n}`))
    box.append(c)
  }
}

function item (r, labeling) {
  const box = el('div', 'item')
  const head = el('div', 'dim', [r.id, when(r.received), r.os || r.platform, r.app && `HPC Hub ${r.app}`, r.page]
    .filter(Boolean).join(' · '))
  box.append(head, el('p', 'said', r.said || '(nothing said)'))
  const tools = el('div', 'tools')
  if (r.shot) {
    const b = el('button', '', 'Screenshot')
    b.onclick = async () => {
      b.disabled = true
      try {
        const res = await fetch(`reports/${encodeURIComponent(r.id)}/screenshot`,
          { headers: { Authorization: `Bearer ${key()}` } })
        if (!res.ok) throw new Error('No screenshot')
        const img = el('img')
        img.alt = `Screenshot sent with ${r.id}`
        img.src = URL.createObjectURL(await res.blob())
        box.append(img)
        b.remove()
      } catch (e) { b.textContent = e.message }
    }
    tools.append(b)
  }
  if (labeling) tools.append(labeler(r))
  box.append(tools)
  return box
}

function labeler (r) {
  const pick = el('select')
  pick.setAttribute('aria-label', `Bug for report ${r.id}`)
  pick.append(new Option(r.label ? 'Take it out' : 'Put under a bug…', ''))
  for (const b of data.bugs) pick.append(new Option(`${b.title} (${b.id})`, b.id))
  pick.append(new Option('New bug…', '+'))
  pick.onchange = async () => {
    let bug = pick.value
    try {
      if (bug === '+') {
        const title = prompt('What is the bug, in a few words?')
        if (!title) { pick.value = ''; return }
        const id = prompt('Its label (a-z, 0-9 and -):',
          title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60))
        if (!id) { pick.value = ''; return }
        await api('bugs', { id, title })
        bug = id
      }
      await api('label', { report: r.id, bug })
      await load()
    } catch (e) { fail(e) }
  }
  return pick
}

function render () {
  const { bugs, unlabeled } = data
  const open = bugs.filter((b) => b.status === 'open')
  $('summary').textContent = `${plural(data.reports, 'report', 'reports')}, ${plural(bugs.length, 'bug', 'bugs')}.`
  const stats = $('stats')
  stats.replaceChildren()
  for (const [n, what] of [[open.length, 'open bugs'], [bugs.length - open.length, 'fixed or closed'],
    [unlabeled.length, 'not labeled yet'], [data.reports, 'reports in all']]) {
    const s = el('div', 'stat')
    s.append(el('b', '', String(n)), el('span', 'dim', what))
    stats.append(s)
  }
  for (const b of document.querySelectorAll('[data-show]')) b.classList.toggle('on', b.dataset.show === show)

  const list = $('bugs')
  list.replaceChildren()
  const shown = bugs.filter((b) => show === 'all' || (show === 'open' ? b.status === 'open' : b.status !== 'open'))
  if (!shown.length) list.append(el('p', 'dim', show === 'open' ? 'No open bugs.' : 'Nothing here.'))
  for (const b of shown) {
    const card = $('bug').content.firstElementChild.cloneNode(true)
    const st = card.querySelector('.status')
    st.textContent = b.status === 'wontfix' ? "won't fix" : b.status
    st.classList.add(b.status)
    card.querySelector('.title').textContent = b.title
    card.querySelector('.label').textContent = b.id
    card.querySelector('.counts').textContent =
      `${plural(b.reports, 'report', 'reports')} from about ${plural(b.people, 'person', 'people')}`
    chips(card.querySelector('.systems'), b.systems, '')
    chips(card.querySelector('.versions'), b.versions, 'HPC Hub ')
    card.querySelector('.meta').textContent = [
      b.first && `First ${when(b.first)}`, b.last && b.last !== b.first && `last ${when(b.last)}`,
      b.fixed_in && `fixed in ${b.fixed_in}`, b.test && `test: ${b.test}`, b.note,
    ].filter(Boolean).join(' · ')
    const items = card.querySelector('.items')
    for (const r of b.items) items.append(item({ ...r, label: b.id }, true))
    list.append(card)
  }

  $('loose').hidden = !unlabeled.length
  const loose = $('loose-list')
  loose.replaceChildren()
  for (const r of unlabeled) {
    const card = el('div', 'report')
    card.append(item(r, true))
    loose.append(card)
  }
}

function fail (e) {
  $('error').hidden = false
  $('error').textContent = e.message
  if (e.locked) lock()
}

function lock () {
  typed = ''
  try { localStorage.removeItem(KEY) } catch { /* nothing kept */ }
  $('overview').hidden = true
  $('loose').hidden = true
  $('bugs').replaceChildren()
  $('unlock').hidden = false
  $('key').focus()
}

async function load () {
  $('error').hidden = true
  data = await api('board')
  $('unlock').hidden = true
  $('overview').hidden = false
  render()
}

$('unlock').onsubmit = (e) => {
  e.preventDefault()
  typed = $('key').value.trim()
  try { localStorage.setItem(KEY, typed) } catch { /* only for this visit */ }
  $('key').value = ''
  load().catch(fail)
}
$('lock').onclick = lock
for (const b of document.querySelectorAll('[data-show]')) b.onclick = () => { show = b.dataset.show; render() }

if (key()) load().catch(fail)
else lock()
