// theme and state come from the URL (?theme=dark&state=default|edit|gpu).
(function () {
  const q = new URLSearchParams(location.search);
  const h = document.documentElement;
  h.dataset.theme = q.get('theme') || 'dark';
  h.dataset.state = q.get('state') || 'default';
  const icons =
    '<svg width="17" height="12" viewBox="0 0 17 12"><rect x="0" y="8" width="3" height="4" rx="1"/><rect x="4.5" y="5.5" width="3" height="6.5" rx="1"/><rect x="9" y="3" width="3" height="9" rx="1"/><rect x="13.5" y="0" width="3" height="12" rx="1"/></svg>' +
    '<svg width="16" height="12" viewBox="0 0 16 12"><path d="M8 11.5 5.6 9a3.4 3.4 0 0 1 4.8 0zM3.5 6.9a6.4 6.4 0 0 1 9 0l-1.4 1.4a4.4 4.4 0 0 0-6.2 0zM1.3 4.7a9.5 9.5 0 0 1 13.4 0l-1.4 1.4a7.5 7.5 0 0 0-10.6 0z"/></svg>' +
    '<svg width="26" height="12" viewBox="0 0 26 12"><rect x=".5" y=".5" width="22" height="11" rx="3.5" fill="none" stroke="currentColor" opacity=".45"/><rect x="2.5" y="2.5" width="15" height="7" rx="2"/><rect x="23.8" y="4" width="1.6" height="4" rx=".8" opacity=".45"/></svg>';
  const back = '<svg width="26" height="20" viewBox="0 0 26 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M8 2h15a1.5 1.5 0 0 1 1.5 1.5v13A1.5 1.5 0 0 1 23 18H8l-7-8z"/><path d="m12 7 6 6m0-6-6 6" stroke-linecap="round"/></svg>';
  const kbA = '<div class="kb kb-a">' +
    '<b>1</b><b>2</b><b>3</b><b class="fn">' + back + '</b>' +
    '<b>4</b><b>5</b><b>6</b><b class="fn done">Done</b>' +
    '<b>7</b><b>8</b><b>9</b>' +
    '<b class="fn"></b><b>0</b><b class="fn"></b></div>';
  const kbI = '<div class="kb kb-i"><div class="tb">Done</div><div class="grid">' +
    '<b>1</b><b>2</b><b>3</b><b>4</b><b>5</b><b>6</b><b>7</b><b>8</b><b>9</b><b class="e"></b><b>0</b><b class="e">' + back + '</b></div></div>';
  document.addEventListener('DOMContentLoaded', () => {
    const st = h.dataset.state;
    document.querySelectorAll('[data-on]').forEach((e) => {
      if (e.dataset.on.split(' ').includes(st)) e.classList.add('on');
    });
    document.querySelectorAll('[data-show]').forEach((e) => {
      if (!e.dataset.show.split(' ').includes(st)) e.remove();
    });
    document.querySelectorAll('.sb').forEach((sb) => {
      sb.innerHTML = '<span class="sbt">9:41</span><span class="sbi">' + icons + '</span>';
    });
    document.querySelectorAll('.gb').forEach((g) => (g.innerHTML = '<i></i>'));
    if (st === 'edit' && document.body.dataset.kb) {
      document.querySelector('.gb').insertAdjacentHTML('beforebegin', document.body.dataset.kb === 'ios' ? kbI : kbA);
    }
  });
})();
