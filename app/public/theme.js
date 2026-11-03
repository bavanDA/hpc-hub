// Light, dark or a named theme before the first paint, from the last choice in Settings (app/src/theme.ts keeps
// it right after)
(function () {
  var dark = window.matchMedia('(prefers-color-scheme: dark)').matches
  try {
    var a = localStorage.getItem('hpchub-appearance')
    // the named themes by their base (theme.ts THEMES)
    var dark_ = ['charcoal', 'frost', 'dusk'], light_ = ['daylight', 'sand']
    if (a === 'light' || light_.indexOf(a) >= 0) dark = false
    if (a === 'dark' || dark_.indexOf(a) >= 0) dark = true
    if (dark_.indexOf(a) >= 0 || light_.indexOf(a) >= 0) document.documentElement.dataset.tint = a
  } catch (e) { /* storage blocked: follow the computer */ }
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
})()
