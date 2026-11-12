# AI agents

Run Claude, ChatGPT (Codex), Antigravity or Cursor on a compute node, next to your code and data.

## Before you start

The agent's own program has to be installed in your account on the cluster, and you need an account with that
agent's company. **Ask all** shows **Not installed** next to an agent it can't find.

## Start an agent

Open **Agents** on a cluster card, or **Open** on a project, and pick one. The window
has:

- **Task (optional)**: a first thing to work on.
- **Folder**: where it works.
- **Use a new compute node**: off, it shares your node; on, it gets its own.
- The agent's options, such as **Model** or **Permission mode**.

Select **Start**. The agent opens in a terminal tab and keeps running after you close the app,
until you stop it or its node's time runs out. **Or continue a chat** in the same window picks up an
earlier chat.

## Reopen an agent

The **Running** tab of **Agents** lists every agent running on your clusters. Select
one to open it again.

## Permissions

The **Permissions** tab sets what **Claude** may do on a cluster without asking you.
It is saved in Claude's settings on that cluster:

- **Edit files without asking**.
- **Move deleted files to the trash**, kept for 7 days.
- **Ask first**: cancelling jobs, force pushing and throwing away changes always ask.
- **Run without asking**: groups of commands, and **Add a command** for your own.

The other agents follow their own permission settings, chosen in their window.

### Passcode lock

The **Passcode lock** on the same tab makes Claude on a cluster take no messages until you start
one with the current code from your authenticator app, like `123456 fix the tests`.

## Remote control

Some agents can be used from another device while they run on the cluster: **Remote control** for
Claude (claude.ai/code or the Claude app) and Antigravity, and **ChatGPT remote** for ChatGPT (a
pairing code shows in the terminal).

## Ask all

**Ask all agents**, in a project's **Open** window, puts one question to several agents.
Choose **Who answers**, and **Let them read each other's answers** for a second
round.
