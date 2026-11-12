# Projects

A project is a saved name for a folder on a cluster. Open it in your tools in one click, or copy it to another cluster.

## Make or add a project

On the **Projects** page:

- **New project** makes a folder: a **Name** (like `thesis`), the
  **Cluster**, what to **Start with** (Empty, LaTeX paper or Python), and whether to
  **Make it a git repository**.
- **Add folder** turns a folder you already have into a project.

The **⋮** menu has **Edit**, **Copy path** and **Remove from
the list**. Removing keeps the folder on the cluster.

!!! note

    Scratch gets cleaned up. Keep work you need in your project space. See
    [Back up scratch](backup.md).

## Open a project

**Open** connects if needed and offers **Code**, **Files**,
**Terminal**, [VS Code](vscode.md), and the [AI agents](agents.md). Each one
starts in the project's folder.

## Copy or sync to another cluster

**Copy or sync** on a project copies it when you select it. The source stays as it is.

1. **Where**: the cluster and folder. HPC Hub suggests your project space there.
2. **How**: **Globus** for big projects (copying again only sends what changed), or
   **Through this laptop** for small ones.
3. **What to take**: untick large outputs you can make again.

Select **Copy** or **Sync**. Both clusters must be connected. Progress shows under
**Copies**, where **Stop copy** stops it.

### Claude chats

Tick the Claude chats to take along, and you can continue them on the other cluster.
