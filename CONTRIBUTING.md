# Contributing to HPC Hub

Thank you for helping. We welcome contributions of every size:

- **Fix an issue**: pick one from [Issues](https://github.com/bavanDA/hpc-hub/issues), or report a bug you found.
- **Add a feature**: open an issue first so we can agree on the idea, then send a pull request.
- **Add your cluster**: see below. It takes one file.
- **Improve the docs**: the user guides live in `wiki/docs` as Markdown (MkDocs Material).

Every pull request runs the tests below. Keep changes focused, follow the guidelines at the end, and never put real
usernames, passwords or personal paths in code or tests.

## Add your cluster

Each built-in cluster is one file in `hpc_hub/clusters/` (`wulver.py`, `yale.py`, `sdsc.py`):

1. Copy the one closest to yours (same sign-in: password and Duo, SSH key, or an authenticator code).
2. Change `cluster()`: its name, login host, VPN, and the node sizes to start with.
3. Fill in `SITE` only for what your cluster does its own way (see `site.py`); leave the rest out.
4. Add it to `ALL` in `hpc_hub/clusters/__init__.py`, run the tests, and open a pull request.

Nothing else in the code names a cluster, so that's all.

## Code layout

    app/          desktop app: Tauri (src-tauri, Rust) and React (src)
    mobile/       Android app; reuses app/src
    hpc_hub/      Python backend the apps talk to over JSON-RPC
      api/        the RPC server and one module per feature in methods/
      core/       config, keyring, SSH: used by every feature
      connect/    VPN, sign-in, Duo
      compute/    Slurm, compute nodes, jobs, usage
      files/      browse, edit and copy files on the clusters
      globus/     Globus sign-in, collections and transfers
      agents/     Claude and other agents, chats, skills, permissions
      latex/      LaTeX editor, build, SyncTeX, git
      pdf/        PDF tools and read aloud
      projects/   named project folders and copying them across clusters
      terminals/  tmux sessions
      backup/     backups of cluster folders
    bin/          helpers ssh and openconnect call (askpass, SSO)
    packaging/    the frozen backend and release settings
    tests/        same folders as hpc_hub/

## Development

    python3 -m venv .venv
    .venv/bin/pip install pytest ruff -r packaging/requirements-backend.txt
    .venv/bin/python -m pytest -q
    .venv/bin/ruff check hpc_hub tests packaging

    cd app && npm ci
    npm run tauri dev      # the desktop app
    npx tsc -b && npm test # types and frontend tests

Guidelines:

- Each feature has its own folder in `hpc_hub/` and in `app/src/components/`. Logic that parses output or builds
  shell commands has tests. Shared test fakes are in `tests/helpers.py`.
- One job per file. A file over about 300 lines should be split.
- Remote commands go through `SshMaster.run`. Quote paths with `shlex.quote`.
- Never hardcode usernames, passwords or personal paths, including in tests. Use made-up names like `jdoe`.
- Few comments, and only ones that say why. Lines up to 120 characters.
- UI text: plain and short, no em or en dashes.
- Commits: atomic, `type(scope): short msg`.

Releasing a version (the update key, the Build workflow's publish option): [docs/releasing.md](docs/releasing.md).

Docs: `pip install -r wiki/requirements.txt`, then `mkdocs serve -f wiki/mkdocs.yml` shows the guides at
http://127.0.0.1:8000 while you edit `wiki/docs`. `mkdocs build -f wiki/mkdocs.yml --strict` catches broken links.

## Globus app id

Globus copies need a free Globus app id. Make one at app.globus.org/settings/developers (choose a native app, name it
HPC Hub, redirect URL `https://auth.globus.org/v2/web/auth-code`) and paste it on the Globus page.
