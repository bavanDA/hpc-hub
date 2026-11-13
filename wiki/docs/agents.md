# AI agents

Run Claude, ChatGPT (Codex), Antigravity or Cursor on a compute node, next to your code and data.

## Before you start

The agent's own program has to be installed in your account on the cluster. You also need an account with that agent's company.

**Ask all** shows **Not installed** next to an agent it can't find.

## Start an agent

Start an agent from a cluster card or from a project. It opens in a terminal tab.

1. Open **Agents** on a cluster card, or select **Open** on a project.
2. Pick an agent.
3. Enter a first thing to work on in **Task (optional)**, or leave it empty.
4. Set **Folder** to the folder where the agent works.
5. Leave **Use a new compute node** off to share your compute node, or turn it on to give the agent its own compute node.
6. Set the agent's options, such as **Model** or **Permission mode**.
7. Select **Start**.

Select **Or continue a chat** in the same window to pick up an earlier chat.

!!! note

    The agent keeps running after you close the app. It stops when you stop it, or when its node's time runs out.

## Reopen an agent

The **Running** tab of **Agents** lists every agent running on your clusters, so you can open one again.

1. Open **Agents**.
2. Select the **Running** tab.
3. Select an agent to open it again.

## Permissions

The **Permissions** tab sets what Claude may do on a cluster without asking you. The choices are saved in Claude's settings on that cluster.

- **Edit files without asking**: Claude may edit files without asking you.
- **Move deleted files to the trash**: deleted files are kept for 7 days.
- **Ask first**: cancelling jobs, force pushing and throwing away changes always ask you.
- **Run without asking**: groups of commands. Select **Add a command** to add your own.

The other agents follow their own permission settings. You choose those in their window.

### Passcode lock

**Passcode lock** on the **Permissions** tab makes Claude on a cluster take no messages until you start a message with the current code from your authenticator app.

For example: `123456 fix the tests`.

## Remote control

Some agents can be used from another device while they run on the cluster.

- **Remote control** is for Claude and Antigravity. For Claude, use claude.ai/code or the Claude app.
- **ChatGPT remote** is for ChatGPT. A pairing code shows in the terminal.

## Ask all

**Ask all agents**, in a project's **Open** window, puts one question to several agents.

1. Select **Open** on a project.
2. Select **Ask all agents**.
3. Choose **Who answers**.
4. Select **Let them read each other's answers** for a second round.
