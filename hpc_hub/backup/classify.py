"""Which kind of file a path in scratch is, by rules. Also runs on the cluster, pasted in front of
summarize.py and listfilter.py: standard library and old Python 3 only."""

import fnmatch
import os

RULES = {
    # any folder on the way with one of these names: everything below it can be made again
    "regen_dirs": ["__pycache__", ".venv", "venv", "site-packages", "node_modules", ".cache", ".ipynb_checkpoints",
                   "conda-meta", "tmp", "temp", ".tox", ".pytest_cache", ".mypy_cache", "build", "dist", "wandb"],
    "regen_globs": ["core", "core.[0-9]*", "*.o", "*.so", "*.a", "*.pyc", "*.pyo", "*.swp", "*~", ".DS_Store"],
    "checkpoint_dirs": ["checkpoint*", "ckpt*"],
    "checkpoint_globs": ["*.ckpt", "*.pt", "*.pth", "*.safetensors", "checkpoint*", "ckpt*"],
    "code_exts": [".py", ".r", ".jl", ".c", ".cc", ".cpp", ".cxx", ".h", ".hpp", ".f", ".f90", ".f95", ".for",
                  ".cu", ".m", ".ipynb", ".sh", ".bash", ".slurm", ".sbatch", ".pbs", ".pl", ".rb", ".go", ".rs",
                  ".java", ".scala", ".js", ".ts", ".lua", ".tcl", ".awk", ".sql", ".do", ".sas", ".mk", ".cmake"],
    "code_names": ["makefile", "cmakelists.txt", "dockerfile", "snakefile", "requirements.txt", "environment.yml",
                   "pyproject.toml", "setup.py", "setup.cfg", "jobscript", "submit"],
    "writing_exts": [".tex", ".bib", ".md", ".txt", ".docx", ".doc", ".org", ".rst", ".odt", ".pptx", ".key"],
    "results_exts": [".csv", ".tsv", ".parquet", ".feather", ".h5", ".hdf5", ".nc", ".npz", ".npy", ".mat",
                     ".rds", ".rdata", ".pkl", ".pickle", ".png", ".pdf", ".svg", ".eps", ".jpg", ".jpeg", ".tif",
                     ".tiff", ".xlsx", ".xls", ".sqlite", ".db", ".zarr", ".vtk", ".vtu", ".xdmf", ".fits"],
    "results_dirs": ["results", "result", "output*", "out", "figures", "figs", "plots", "final*", "analysis"],
    "log_globs": ["slurm-*.out", "*.log", "*.err", "*.out"],
    "input_exts": [".json", ".yaml", ".yml", ".cfg", ".ini", ".in", ".nml", ".toml", ".conf", ".xml", ".inp"],
}


def _any(name, globs):
    return any(fnmatch.fnmatchcase(name, g) for g in globs)


def classify(relpath, size=0):
    """The class of one file, from its path under scratch (and its size, for big unknown files)."""
    parts = [p for p in relpath.replace("\\", "/").split("/") if p]
    if not parts:
        return "unsure"
    name = parts[-1]
    low = name.lower()
    dirs = [d.lower() for d in parts[:-1]]
    ext = os.path.splitext(low)[1]
    if ".git" in dirs:
        return "code"  # a repository's history goes with it
    if any(d in RULES["regen_dirs"] for d in dirs) or _any(low, RULES["regen_globs"]):
        return "regen"
    if any(_any(d, RULES["checkpoint_dirs"]) for d in dirs) or _any(low, RULES["checkpoint_globs"]):
        return "checkpoint"
    if ext in RULES["code_exts"] or low in RULES["code_names"]:
        return "code"
    if _any(low, RULES["log_globs"]):
        return "logs"
    if ext in RULES["writing_exts"] or low.startswith("readme"):
        return "writing"
    if ext in RULES["results_exts"]:
        return "results"
    if ext in RULES["input_exts"]:
        return "inputs"
    if any(_any(d, RULES["results_dirs"]) for d in dirs):
        return "results"
    return "unsure"
