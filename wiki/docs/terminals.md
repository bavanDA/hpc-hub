# Terminals

Each terminal is a tmux session on the cluster. Closing a tab or the app leaves it running; stopping the session or the end of its compute job stops it.

## Open a terminal

Select **Terminal** on a cluster card, or **New terminal** on the
**Terminals** page. Choose:

- **Name**: anything. It starts as the time, like *Terminal 14:05*.
- **Run on**: **Login node**, or your compute node.
- **Start in**: the folder to start in. Empty means your home folder.

Select **Open terminal**.

## Login node or compute node

The login node is shared. Use it to edit files, move them and submit jobs. Run builds, installs and scripts on
your compute node, within the resources your job has. A terminal on a compute node stops when the node's time is
up, so check the time left on the card before a long install.

## Sessions keep running

Closing a tab leaves the session running. The **Sessions** list on the Terminals page shows every
session on each connected cluster, including tmux and screen sessions you started yourself. Select one to open it
again. Its **⋮** menu has **Rename** and **Stop session**, which asks
first.

If the cluster says **tmux is not installed here**, sessions can't be kept there.

### Reconnecting

When the connection drops, the tab says so and offers **Reconnect**. Once the cluster is back, the
tab attaches to the session again. **This session has ended.** means the session is gone, for
example because its compute node's time ran out.

## The timeline

The map on the right edge of a terminal shows the whole session's output, with prompts, tables and your marks.
Scroll up or drag the map to read back in a copy over the terminal; the session keeps running underneath.

- **Back to live**, `Esc` or typing returns to the terminal.
- The arrows for **Prompts** step to the previous or next command you ran. Down past the last one
  returns to live.

### Marks

A mark is a named place in the history. While reading, select the gutter left of a line, or press
`M`, and name it. **Marks** lists them, with **Copy**, **Rename**
and **Remove**. Marks are kept in your home folder on the cluster, so every device sees them, and a
mark keeps its text after the session ends.

## Settings

In **Settings**, under **Terminals**: **Select to copy**, and the
**Monitoring bar** with CPU, memory and network under each terminal.

## Pasting scripts

A script with `set -e` ends the terminal's shell when a command fails, if you paste it. Save it to
a file and run `bash setup.sh` instead. See
[Troubleshooting](troubleshooting.md#a-pasted-script-closed-my-terminal).
