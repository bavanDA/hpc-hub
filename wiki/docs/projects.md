# Projects

A project is a saved name for a folder on a cluster. You can open that folder in your tools in one click, or copy it to another cluster.

## Create a new project

**New project** makes a folder and saves it as a project.

1. On the **Projects** page, select **New project**.
2. Enter a **Name**, such as `thesis`.
3. Choose the **Cluster**.
4. Choose what to **Start with**: Empty, LaTeX paper, or Python.
5. Choose whether to **Make it a git repository**.

## Add a folder you already have

**Add folder** on the **Projects** page turns a folder you already have into a project.

!!! note

    Scratch gets cleaned up. Keep work you need in your project space. See [Back up scratch](backup.md).

## Edit, copy the path, or remove a project

The **⋮** menu on a project has **Edit**, **Copy path**, and **Remove from the list**.

**Remove from the list** takes the project off the list. The folder stays on the cluster.

## Open a project

**Open** connects to the cluster if needed. It then offers **Code**, **Files**, **Terminal**, [VS Code](vscode.md), and the [AI agents](agents.md). Each one starts in the project's folder.

## Copy or sync to another cluster

**Copy or sync** copies the project to another cluster when you select **Copy** or **Sync**. The source stays as it is. Both clusters must be connected.

1. Select **Copy or sync** on the project.
2. Set **Where** to the cluster and folder. HPC Hub suggests your project space there.
3. Set **How** to **Globus** for a big project, or **Through this laptop** for a small one. If you copy again with **Globus**, only what changed is sent.
4. Under **What to take**, untick large outputs you can make again.
5. Select **Copy** or **Sync**.

Progress shows under **Copies**. Select **Stop copy** there to stop it.

### Claude chats

Tick the Claude chats to take along. You can continue them on the other cluster.
