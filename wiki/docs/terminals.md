# Terminals

Open a terminal to run commands on your cluster and come back to the same session later. Each terminal is a tmux session: it keeps running after you close the tab or the app, and it stops when you stop the session or when its compute job ends.

## Open a terminal

Choose a name, where the terminal runs, and the folder it starts in.

1. Select **Terminal** on a cluster card, or **New terminal** on the **Terminals** page.
2. Set **Name** to any name you want. It starts as the time, like *Terminal 14:05*.
3. Set **Run on** to **Login node** or your compute node.
4. Set **Start in** to the folder you want. Leave it empty to start in your home folder.
5. Select **Open terminal**.

## Login node or compute node

The login node is shared. Use it to edit files, move files, and submit jobs. Run builds, installs, and scripts on your compute node, within the resources your job has.

A terminal on a compute node stops when the node's time is up. Check the time left on the card before a long install.

## Sessions keep running

The **Sessions** list on the **Terminals** page shows every session on each connected cluster, including tmux and screen sessions you started yourself. Select a session to open it again.

To rename or stop a session:

1. Open its **⋮** menu.
2. Select **Rename** or **Stop session**.

**Stop session** asks you first.

!!! note

    If the cluster says "tmux is not installed here", sessions can't be kept there.

### Reconnecting

When the connection drops, the tab says so and offers **Reconnect**. Select **Reconnect**. Once the cluster is back, the tab attaches to the session again.

"This session has ended." means the session is gone, for example because its compute node's time ran out.

## The timeline

The map on the right edge of a terminal shows the whole session's output, with prompts, tables, and your marks. Scroll up or drag the map to read earlier output in a copy over the terminal. The session keeps running underneath.

- Select **Back to live**, press `Esc`, or start typing to return to the terminal.
- The arrows for **Prompts** step to the previous or next command you ran. Moving down past the last one returns you to live output.

### Marks

A mark is a named place in the history. Add one while you are reading earlier output.

1. Select the gutter to the left of a line, or press `M`.
2. Name the mark.

**Marks** lists your marks, with **Copy**, **Rename**, and **Remove**. Marks are kept in your home folder on the cluster, so every device sees them. A mark keeps its text after the session ends.

## Settings

In **Settings**, under **Terminals**, use **Select to copy** and the **Monitoring bar**. The **Monitoring bar** shows CPU, memory, and network under each terminal.

## Pasting scripts

When a script contains `set -e`, save it to a file and run it with bash. Pasting it ends the terminal's shell when a command fails.

1. Save the script to a file.
2. Run `bash setup.sh`.

See [Troubleshooting](troubleshooting.md#a-pasted-script-closed-my-terminal).
