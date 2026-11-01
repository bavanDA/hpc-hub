# Code

A light editor for files on your clusters, like a stripped-down VS Code, made to work well with the agents. It is a
tab on the phone and a page on the desktop, built from the same parts. The contract with the backend is in
`app/src/types/code.ts`.

## Where it lives

- **Phone:** tabs Clusters, Terminals, **Code**, Jobs, More. Code took Files' place: on a phone you browse mostly to
  read or edit scripts and logs. The full file manager (copy, paste, zip, upload, download, transfers) is More ›
  Files.
- **Desktop:** the sidebar's Work group is Projects, Terminals, **Code**, Agents, Papers. Opening a text file from
  Files, a project or a job's output goes to Code.
- **Getting there:** `go('code', { cluster, path, line })` from anywhere (a cluster card, a project, a job).

## The screen (phone)

- **Header:** the files drawer, the file name (a dot when unsaved; tap for the cluster, the full path and Copy
  path), then Search, Ask, Save when there are edits, and a menu (Go to line, Wrap, Text size, Submit job for Slurm
  scripts, Run in terminal, Reload, Close).
- **Open files** as chips when there are two or more, a dot on the unsaved ones.
- **Banners:** changed on the cluster, not connected (with Connect), read-only and why, edits restored.
- **Editor:** CodeMirror 6 with line numbers, wrapping, bracket matching and closing, undo history. A file opens to
  read, so scrolling never pops the keyboard; the pencil makes it editable (a hardware keyboard opens it editable).
- **Key row** over the keyboard: Tab, dedent, arrows, Undo, Redo, then the symbols the language needs (Python
  `: ( ) [ ] = _ #`, shell and Slurm `$ { } | > & ;`, C and Fortran `{ } ; < > *`, LaTeX `\ { } $ ^ _ &`, R, Julia and
  MATLAB `<- ( ) [ ] %`).
- **Selection bar** over a selection: Copy, Ask, Explain, Copy reference ("train.py:40-58").
- **Search** in the file with "3 of 12", and replace.
- **Hardware keys:** Ctrl+S, Ctrl+F, Ctrl+Z and Ctrl+Y, Ctrl+/ to comment.
- **Files drawer:** the cluster, places, the path and the list; "Go to file" by name; long-press for New file, New
  folder, Rename, Delete, Copy path.

The desktop page has a file tree on the left, tabs, the Ask panel on the right and a status line (cluster, path, line
and column, spaces or tabs, line endings, Saved).

## Languages

Loaded when a file needs them, by extension, file name or first line: Python, C and C++ (and CUDA), Markdown, JSON,
YAML with full parsers; shell, Fortran, Julia, R, MATLAB, LaTeX and BibTeX, TOML and CMake with CodeMirror's simpler
modes. Slurm scripts (`.slurm`, `.sbatch`, or any shell file with `#SBATCH` lines) also get the `#SBATCH` options
highlighted and completed, with the cluster's own partitions. Notebooks open read-only. Indentation is taken from the
file, and Windows line endings are kept.

## Saving safely

- `code.open` answers the text with a sha256 of the bytes, the line endings, and whether the file can be written.
  Files that aren't UTF-8 text, or are bigger than 2 MB on the phone (8 MB on the desktop), open read-only, so
  saving can never damage them.
- `code.save` saves only if the file on the cluster still has the sha you opened (compare and swap). It keeps the
  file's permissions (a runnable script stays runnable) and writes through symlinks.
- When the file changed meanwhile: "train.py changed on Wulver since you opened it", with Compare, Keep mine, Use
  theirs, Copy mine.
- Unsaved edits are kept on the device every second, so they survive the app being closed: "Restore your edits from
  10:42?"

## Working with agents

- **Ask** on a selection or a file: Explain this, Fix this error, Write a test, or a question in your words. "Fix
  this error" takes the error from the clipboard, a pasted text, the newest error file of a Slurm job, or the last
  lines of an open terminal.
- **A quick ask** runs the agent once on the cluster, headless, in its own tmux session on your node, so it keeps
  going when you lock the phone. It never edits your file in place: it writes the full new version of each file it
  wants to change, plus a short answer. If it changes the file anyway, that change becomes the proposal and Reject
  puts the old text back.
- **The answer** comes back as plain text and a diff per change, with Accept and Reject on each, and Accept all /
  Reject all. Accept changes the editor's text; you then Save, or use "Accept and save". New files (a test) show as
  "New file" with Accept. "Keep talking" opens the same chat in Terminals.
- **Sending to a running agent** pastes "In ~/proj/train.py lines 40 to 58: ..." into its terminal.
- **Changes from agents:** while Code is open, open files are checked every 10 seconds. A file you haven't edited
  reloads quietly ("Updated from the cluster"); one you have edited shows "train.py changed on Wulver" with Compare,
  Reload, Keep mine.
- **Logs** (`.out`, `.err`, `.log`) open read-only at the end, can follow as they grow, and Python tracebacks link
  to the line they name.

The main path to test end to end: a job fails, its errors open in Code, "Fix this error", Accept and save, Submit
job again.

## Parts

Shared in `app/src/components/code/`: the editor, languages, the Slurm extension, theme, search, the key rows, the
store of open files, drafts, the change watcher, the ask flow, the diff, Markdown and the ask and result views. The
phone's shell is `mobile/src/screens/Code.tsx` with `mobile/src/parts/code/`; the desktop's is
`app/src/pages/Code.tsx` with `app/src/components/code/desktop/`. The backend is `hpc_hub/code/` with
`api/methods/code.py` and `code_ask.py` (not under a `ui/` folder: the phone's Python bundle leaves those out).
