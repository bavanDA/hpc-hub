# Coding standards

- Python 3 + GTK4/libadwaita (PyGObject).
- Code is grouped by feature: `hpc_hub/<feature>/` holds its logic, `hpc_hub/<feature>/ui/` its GTK pages and dialogs.
  Features: `connect`, `compute`, `files`, `globus`, `agents`, `latex`, `pdf`, `projects`, `terminals`.
  `core/` is what every feature uses (config, keyring, SSH); `ui/` is the main window and shared widgets.
- Tests mirror the code: `tests/<feature>/test_*.py`. Shared fakes live in `tests/helpers.py`.
- Lint with `.venv/bin/ruff check hpc_hub tests` (config in `ruff.toml`).
- Keep modules small and about one thing. A UI file over ~400 lines wants splitting by feature.
- Pure logic (parsing Slurm/tmux/synctex output, building shell commands) lives outside `ui/` and has pytest tests.
- Never block the GTK main loop: run remote work with `widgets.bg(work, done)`.
- Remote commands go through `SshMaster.run` (fast shell, no `.bashrc` per call); quote paths with `shlex.quote`.
- Never hardcode usernames or passwords; secrets live in the GNOME keyring.
- Short docstrings, few comments, and only ones that say why. Line length about 120.
- UI copy: plain and short, no em or en dashes.
- Commits: atomic, `type(scope): short msg`. Never rewrite pushed history.
