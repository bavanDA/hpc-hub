import subprocess

import gi

gi.require_version("Gtk", "4.0")
gi.require_version("Adw", "1")

from hpc_hub.latex.ui import file_tree  # noqa: E402


def names(store):
    return [store.get_item(i).name for i in range(store.get_n_items())]


def test_folders_first_then_files_at_every_level():
    entries = [("f", "main.tex"), ("d", "figures"), ("f", "figures/b.png"), ("f", "figures/a.pdf"),
               ("d", "sections"), ("d", "sections/old"), ("f", "sections/intro.tex"), ("f", "appendix.tex"),
               ("d", "empty")]
    root = file_tree.build_nodes(entries)
    assert names(root) == ["empty", "figures", "sections", "appendix.tex", "main.tex"]
    sections = root.get_item(2)
    assert sections.is_dir and names(sections.children) == ["old", "intro.tex"]
    assert names(root.get_item(1).children) == ["a.pdf", "b.png"]
    assert file_tree.icon_for(root.get_item(4)) == "x-office-document-symbolic"


def test_listing_skips_build_output_and_hidden(tmp_path):
    for rel in ("main.tex", "main.aux", "main.synctex.gz", "figs/a.png", ".git/config", "empty/"):
        f = tmp_path / rel
        if rel.endswith("/"):
            f.mkdir(parents=True)
        else:
            f.parent.mkdir(parents=True, exist_ok=True)
            f.write_text("x")
    out = subprocess.run(["bash", "-c", file_tree.LIST], cwd=tmp_path, capture_output=True, text=True).stdout
    assert sorted(out.split("\n")[:-1]) == ["d empty", "d figs", "f figs/a.png", "f main.tex"]
