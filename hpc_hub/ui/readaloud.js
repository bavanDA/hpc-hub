// Read aloud inside the PDF.js viewer: play the narration, highlight each spoken word on the page,
// follow it down the document; a triple click on a word asks the app to look it up.
(() => {
  const post = (msg) => window.webkit.messageHandlers.hpchub.postMessage(JSON.stringify(msg));
  let audio = null, words = new Map(), times = [], byPage = new Map(), heights = new Map();
  let current = -1, mark = null, userScrolled = 0, frame = 0;

  async function app() {
    while (!window.PDFViewerApplication) await new Promise((r) => setTimeout(r, 50));
    await PDFViewerApplication.initializedPromise;
    return PDFViewerApplication;
  }

  async function height(page) {
    if (!heights.has(page)) heights.set(page, (await (await app()).pdfDocument.getPage(page)).view[3]);
    return heights.get(page);
  }

  function indexAt(t) {  // last word that started at or before t
    let lo = 0, hi = times.length - 1, found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (times[mid][1] <= t) { found = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return found;
  }

  async function show(i) {
    const [id] = times[i], w = words.get(id);
    if (!w) return;
    const [page, x0, y0, x1, y1] = w, a = await app(), view = a.pdfViewer.getPageView(page - 1);
    if (!view) return;
    const h = await height(page);
    const [ax, ay] = view.viewport.convertToViewportPoint(x0, h - y1);
    const [bx, by] = view.viewport.convertToViewportPoint(x1, h - y0);
    const r = [ax, ay, bx, by];
    if (!mark) {
      mark = document.createElement("div");
      mark.style.cssText = "position:absolute;z-index:20;pointer-events:none;border-radius:3px;" +
        "background:rgba(255,200,0,.45);mix-blend-mode:multiply;transition:all .08s linear";
    }
    if (mark.parentNode !== view.div) view.div.appendChild(mark);
    const left = Math.min(r[0], r[2]), top = Math.min(r[1], r[3]);
    Object.assign(mark.style, {left: `${left - 2}px`, top: `${top - 1}px`,
                               width: `${Math.abs(r[2] - r[0]) + 4}px`, height: `${Math.abs(r[3] - r[1]) + 2}px`});
    const box = mark.getBoundingClientRect(), c = a.appConfig.mainContainer, cb = c.getBoundingClientRect();
    const out = box.bottom > cb.bottom - 40 || box.top < cb.top + 40;
    if (out && Date.now() - userScrolled > 4000) {  // follow the voice unless you just scrolled yourself
      c.scrollTop += box.top - cb.top - cb.height / 3;
    }
  }

  let lastTime = -1;
  function tick() {
    frame = 0;
    if (!audio) return;
    const sec = Math.floor(audio.currentTime);
    if (sec !== lastTime) { lastTime = sec; post({kind: "time", at: audio.currentTime, total: audio.duration || 0}); }
    const i = indexAt(audio.currentTime);
    if (i >= 0 && i !== current) { current = i; show(i); }
    if (!audio.paused) frame = requestAnimationFrame(tick);
  }

  function wordAt(page, x, y) {  // the word under (or nearest to) a point, in PDF points from the top
    let best = null, dist = Infinity;
    for (const id of byPage.get(page) || []) {
      const [, x0, y0, x1, y1] = words.get(id);
      const dx = x < x0 ? x0 - x : x > x1 ? x - x1 : 0, dy = y < y0 ? y0 - y : y > y1 ? y - y1 : 0;
      const d = dx + dy * 3;
      if (d < dist) { dist = d; best = id; }
    }
    return dist < 30 ? best : null;
  }

  async function firstOnVisiblePage() {
    const page = (await app()).page;
    for (let i = 0; i < times.length; i++) if (words.get(times[i][0])?.[0] >= page) return times[i][1];
    return 0;
  }

  window.hpchubSpeak = {
    async load(url, wordList, timings) {
      this.stop();
      // the viewer only plays blob: media, so read the file and hand it over as a blob
      const blob = await (await fetch(url)).blob();
      words = new Map(wordList.map((w) => [w[0], w.slice(1)]));
      byPage = new Map();
      for (const [id, page] of wordList) (byPage.get(page) || byPage.set(page, []).get(page)).push(id);
      times = timings;
      audio = new Audio(URL.createObjectURL(blob));
      const at = () => (audio ? audio.currentTime : 0);
      audio.addEventListener("play", () => { post({kind: "speak", state: "playing", at: at()}); tick(); });
      audio.addEventListener("pause", () => post({kind: "speak", state: "paused", at: at()}));
      audio.addEventListener("ended", () => post({kind: "speak", state: "ended", at: at()}));
      audio.addEventListener("error", () => post({kind: "speak", state: "error", at: at(),
        error: audio && audio.error ? `${audio.error.code} ${audio.error.message}` : "unknown"}));
      for (const ev of ["stalled", "waiting", "emptied", "abort"]) {
        audio.addEventListener(ev, () => post({kind: "speak", state: ev, at: at()}));
      }
      audio.addEventListener("seeked", tick);
    },
    loaded() { return !!audio; },
    now() { return audio ? audio.currentTime : 0; },
    async play(fromView) {
      if (!audio) return;
      if (fromView && audio.currentTime === 0) audio.currentTime = await firstOnVisiblePage();
      audio.play().catch((e) => post({kind: "speak", state: "error", at: audio.currentTime, error: String(e)}));
    },
    pause() { audio && audio.pause(); },
    skip(seconds) {
      if (!audio) return;
      audio.currentTime = Math.max(0, Math.min(audio.currentTime + seconds, (audio.duration || 1e9) - 0.1));
      tick();
    },
    rewind() { if (audio) { audio.pause(); audio.currentTime = 0; current = -1; tick(); } },
    rate(r) { if (audio) audio.playbackRate = r; },
    stop() {
      if (audio) { audio.pause(); URL.revokeObjectURL(audio.src); audio.src = ""; }
      audio = null; current = -1;
      if (mark) mark.remove();
      if (frame) cancelAnimationFrame(frame);
    },
  };

  document.addEventListener("wheel", () => { userScrolled = Date.now(); }, {passive: true});
  function wordFromPoint(x, y) {  // the word under the pointer, from the PDF's own text layer
    const r = document.caretRangeFromPoint(x, y);
    if (!r || r.startContainer.nodeType !== Node.TEXT_NODE || !r.startContainer.parentElement.closest(".textLayer")) return "";
    const t = r.startContainer.textContent, ok = (ch) => /[\p{L}\p{N}'\u2019-]/u.test(ch);
    let a = r.startOffset, b = r.startOffset;
    while (a > 0 && ok(t[a - 1])) a--;
    while (b < t.length && ok(t[b])) b++;
    return t.slice(a, b);
  }

  // triple click a word: the app shows it in the dictionary (with "Read from here"). The double click
  // inside it would jump to the source, so that jump is called off.
  document.addEventListener("click", (e) => {
    if (e.detail !== 3) return;
    clearTimeout(window.hpchubSync);
    window.getSelection().removeAllRanges();  // a triple click also selects the whole line
    clicked(e);
  });

  async function clicked(e) {
    const a = await app();
    if (a.pdfViewer.annotationEditorMode > 0) return;  // drawing or highlighting, not reading
    const div = e.target.closest && e.target.closest(".page");
    const text = wordFromPoint(e.clientX, e.clientY);
    if (!div || !text) return;
    let id = null;
    if (audio) {
      const page = Number(div.dataset.pageNumber), view = a.pdfViewer.getPageView(page - 1);
      const r = div.getBoundingClientRect();
      const [x, y] = view.viewport.convertToPdfPoint(e.clientX - r.left, e.clientY - r.top);
      id = wordAt(page, x, (await height(page)) - y);
    }
    post({kind: "word", text, id});
  }

  window.hpchubSpeak.seekWord = (id) => {
    const t = times.find((s) => s[0] === id);
    if (audio && t) { audio.currentTime = t[1]; audio.play(); }
  };
  window.hpchubSpeak.say = async (url) => {  // a short sound (a word's pronunciation)
    const blob = await (await fetch(url)).blob();
    const once = new Audio(URL.createObjectURL(blob));
    once.addEventListener("ended", () => URL.revokeObjectURL(once.src));
    once.play();
  };
})();
