from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).parent.parent
CODE = (".py", ".ts", ".tsx")


def test_no_two_modules_differ_only_in_case():
    """Windows and macOS see Markdown.tsx and markdown.ts as one file, so the build breaks there."""
    found = defaultdict(set)
    for top in ("hpc_hub", "app/src", "mobile/src"):
        for p in (ROOT / top).rglob("*"):
            if p.suffix in CODE and "node_modules" not in p.parts:
                module = p.name.split(".")[0]
                found[(p.parent, module.lower())].add(module)
    clashes = {str(folder / next(iter(names))): sorted(names) for (folder, _), names in found.items()
               if len(names) > 1}
    assert not clashes
