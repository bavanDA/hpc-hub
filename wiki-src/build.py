"""Writes the wiki's static HTML from content.py. Run: python3 build.py <wiki folder>. The output needs no build."""

import html
import re
import sys
from pathlib import Path

from content import GROUPS, PAGES

ICON = ('<svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" '
        'fill="#1c71d8"/><g fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
        '<rect x="7" y="7" width="18" height="7" rx="2"/><rect x="7" y="18" width="18" height="7" rx="2"/>'
        '<path d="M11 10.5h.01M11 21.5h.01"/></g></svg>')
GLASS = ('<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
         'stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>')
MENU = ('<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
        'stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>')


def slugify(text: str) -> str:
    text = re.sub(r"<[^>]+>", "", text)
    text = html.unescape(text).lower()
    return re.sub(r"[^a-z0-9]+", "-", text).strip("-")


def anchors(body: str) -> str:
    seen: set[str] = set()

    def one(m: re.Match) -> str:
        tag, inner = m.group(1), m.group(2)
        base = slugify(inner) or "part"
        sid, n = base, 2
        while sid in seen:
            sid, n = f"{base}-{n}", n + 1
        seen.add(sid)
        return f'<{tag} id="{sid}">{inner}<a class="anchor" href="#{sid}" aria-label="Link to this part">#</a></{tag}>'

    return re.sub(r"<(h[23])>(.*?)</\1>", one, body, flags=re.S)


def nav(current: str) -> str:
    out = ['<nav class="nav" aria-label="Pages">']
    for group, slugs in GROUPS:
        out.append(f'<div class="nav-group">{group}</div>')
        for slug in slugs:
            p = PAGES[slug]
            cur = ' aria-current="page"' if slug == current else ""
            out.append(f'<a href="{p["file"]}"{cur}>{p["nav"]}</a>')
    out.append("</nav>")
    return "\n".join(out)


def order() -> list[str]:
    return [s for _, slugs in GROUPS for s in slugs]


def pager(slug: str) -> str:
    seq = order()
    i = seq.index(slug)
    parts = ['<nav class="pager" aria-label="Next and previous">']
    if i > 0:
        p = PAGES[seq[i - 1]]
        parts.append(f'<a class="prev" href="{p["file"]}"><small>Previous</small><b>{p["nav"]}</b></a>')
    if i + 1 < len(seq):
        p = PAGES[seq[i + 1]]
        parts.append(f'<a class="next" href="{p["file"]}"><small>Next</small><b>{p["nav"]}</b></a>')
    parts.append("</nav>")
    return "".join(parts)


def page(slug: str) -> str:
    p = PAGES[slug]
    title = "HPC Hub wiki" if slug == "home" else f'{p["title"]} · HPC Hub wiki'
    desc = html.escape(re.sub(r"<[^>]+>", "", p["lead"]), quote=True)
    body = anchors(p["body"].strip())
    tag = ' <span class="tag">Experimental</span>' if p.get("experimental") else ""
    return f"""<!doctype html>
<html lang="en" class="no-js">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(title)}</title>
<meta name="description" content="{desc}">
<meta name="color-scheme" content="light dark">
<link rel="icon" href="assets/icon.svg" type="image/svg+xml">
<link rel="stylesheet" href="assets/wiki.css">
</head>
<body>
<a class="skip" href="#main">Skip to the text</a>
<header class="topbar">
<a class="brand" href="index.html">{ICON}<span>HPC Hub <small>wiki</small></span></a>
<button class="menu-btn" type="button" aria-expanded="false" aria-controls="sidebar">{MENU}Menu</button>
</header>
<div class="scrim"></div>
<div class="layout">
<aside class="sidebar" id="sidebar">
<a class="brand" href="index.html">{ICON}<span>HPC Hub <small>wiki</small></span></a>
<div class="search" role="search">
{GLASS}
<input id="search" type="search" placeholder="Search the wiki" aria-label="Search the wiki" autocomplete="off">
<div class="results" id="results" hidden></div>
</div>
{nav(slug)}
</aside>
<main id="main">
<article class="content">
<h1>{p["title"]}{tag}</h1>
<p class="lead">{p["lead"]}</p>
{body}
{pager(slug)}
<p class="foot">HPC Hub is open source. The code and the releases are on
<a href="https://github.com/bavanDA/hpc-hub">GitHub</a>.</p>
</article>
</main>
</div>
<script src="assets/wiki.js"></script>
</body>
</html>
"""


def main() -> None:
    out = Path(sys.argv[1])
    for slug in order():
        (out / PAGES[slug]["file"]).write_text(page(slug), encoding="utf-8")
    print("wrote", len(order()), "pages")


if __name__ == "__main__":
    main()
