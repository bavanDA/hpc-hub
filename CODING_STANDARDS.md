# Coding standards

- Python 3 + GTK4/libadwaita (PyGObject). Core logic in `hpc_hub/`, GTK pages in `hpc_hub/ui/`.
- Keep modules small and about one thing. A UI file over ~400 lines wants splitting by feature.
- Pure logic (parsing Slurm/tmux/synctex output, building shell commands) lives outside `ui/` and has pytest tests.
- Never block the GTK main loop: run remote work with `widgets.bg(work, done)`.
- Remote commands go through `SshMaster.run` (fast shell, no `.bashrc` per call); quote paths with `shlex.quote`.
- Never hardcode usernames or passwords; secrets live in the GNOME keyring.
- Short docstrings, few comments, and only ones that say why. Line length about 120.
- UI copy: plain and short, no em or en dashes.
- Commits: atomic, `type(scope): short msg`. Never rewrite pushed history.
