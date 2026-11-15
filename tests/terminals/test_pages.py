import subprocess

import pytest

from hpc_hub.terminals import links, pages
from tests.helpers import on_linux_cluster


def sh(line: str) -> str:
    res = subprocess.run(["bash", "-c", line], capture_output=True, text=True)
    if res.returncode != 0 and not res.stdout:
        raise pages.PageError(res.stderr)
    return res.stdout


def test_found_in_output():
    text = ("⏺ Write(design/index.html)\n  ⎿  Wrote 210 lines to design/index.html\n"
            "Saved it to ~/site/about.htm. See https://example.org/a/page.html and /home/jdoe/k/report.html\n"
            "a.html.bak my.htmlx\n")
    assert [(x.kind, x.url) for x in links.find_links(text)] == [
        (links.PAGE, "design/index.html"), (links.PAGE, "~/site/about.htm"), (links.PAGE, "/home/jdoe/k/report.html")]


def test_references():
    html = """<link href="style.css?v=2"><script src='js/app.js'></script><img src="https://x.org/a.png">
    <a href="#top">top</a><img src="../outside.png"><div style="background: url(img/bg.png)"></div>
    <img src="/abs.png"><img src="data:image/png;base64,AA"><a href="mailto:a@b.c">m</a><img src="./js/app.js">"""
    assert pages.references(html) == ["style.css", "js/app.js", "img/bg.png"]
    assert pages.references("url(../img/a.png) url(../../out.png)", of="css/main.css") == ["img/a.png"]


@on_linux_cluster
def test_fetch(tmp_path):
    site = tmp_path / "remote" / "design"
    (site / "img").mkdir(parents=True)
    (site / "index.html").write_text('<link href="style.css"><img src="img/a.png"><img src="gone.png">'
                                     '<img src="../secret.txt">')
    (site / "style.css").write_text("body{}")
    (site / "img" / "a.png").write_bytes(b"\x89PNG")
    (tmp_path / "remote" / "secret.txt").write_text("no")
    here = tmp_path / "here"
    got = pages.fetch(sh, "design/index.html", str(here), cwd=str(tmp_path / "remote"))
    assert got.parent.name.startswith("design-") and got.name == "index.html"
    assert got.read_text().startswith("<link")
    assert (got.parent / "style.css").read_text() == "body{}"
    assert (got.parent / "img" / "a.png").read_bytes() == b"\x89PNG"
    assert not any(p.name == "secret.txt" for p in here.rglob("*"))
    assert pages.fetch(sh, str(site / "index.html"), str(here)) == got  # a full path needs no folder
    with pytest.raises(pages.PageError):
        pages.fetch(sh, "design/nothing.html", str(here), cwd=str(tmp_path / "remote"))


@on_linux_cluster
def test_fetch_follows_links(tmp_path):
    site = tmp_path / "site"
    (site / "css").mkdir(parents=True)
    (site / "img").mkdir()
    (site / "docs").mkdir()
    (site / "index.html").write_text('<a href="about.html">a</a><a href="docs/guide.html">g</a>')
    (site / "about.html").write_text('<link href="css/main.css"><a href="index.html">home</a>')
    (site / "css" / "main.css").write_text("body { background: url(../img/bg.png) }")
    (site / "img" / "bg.png").write_bytes(b"png")
    (site / "docs" / "guide.html").write_text('<img src="../img/bg.png"><a href="../about.html">x</a>')
    (site / "unused.html").write_text("never linked")
    got = pages.fetch(sh, str(site / "index.html"), str(tmp_path / "here"))
    root = got.parent
    names = sorted(str(p.relative_to(root)) for p in root.rglob("*") if p.is_file())
    assert names == ["about.html", "css/main.css", "docs/guide.html", "img/bg.png", "index.html"]


@on_linux_cluster
def test_same_folder_names_kept_apart(tmp_path):
    for d in ("a/design", "b/design"):
        (tmp_path / d).mkdir(parents=True)
        (tmp_path / d / "index.html").write_text(d)
    one = pages.fetch(sh, str(tmp_path / "a/design/index.html"), str(tmp_path / "here"))
    two = pages.fetch(sh, str(tmp_path / "b/design/index.html"), str(tmp_path / "here"))
    assert one != two and (one.read_text(), two.read_text()) == ("a/design", "b/design")


def test_unpack_keeps_inside(tmp_path):
    import base64
    import io
    import tarfile
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w") as tar:
        for name in ("ok.html", "../../evil.txt"):
            info = tarfile.TarInfo(name)
            info.size = 2
            tar.addfile(info, io.BytesIO(b"hi"))
    got = pages.unpack(base64.b64encode(buf.getvalue()).decode(), tmp_path / "in")
    assert got == ["ok.html"] and not (tmp_path / "evil.txt").exists()


def test_where_uses_the_session_folder():
    assert "pane_current_path" in pages.where("a.html", session="hpchub-claude-1-2")
    assert "pane_current_path" not in pages.where("/x/a.html", session="hpchub-claude-1-2")
    assert pages.where("~/a b.html").endswith("\"$HOME\"/'a b.html'")
