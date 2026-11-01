// Light or dark before the first paint, from the last choice in Settings (app/src/theme.ts keeps it right after)
(function () {
  var dark = window.matchMedia('(prefers-color-scheme: dark)').matches
  try {
    var a = localStorage.getItem('hpchub-appearance')
    if (a === 'light' || a === 'dark') dark = a === 'dark'
  } catch (e) { /* storage blocked: follow the computer */ }
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
})()
