# VS Code

VS Code runs on a compute node as a job of its own and opens on your computer, in the VS Code app or the browser. Its window shows each step until VS Code is ready.

## Start VS Code

Select **VS Code** on a cluster card, or open a project with VS Code. If you have no VS Code job
on that cluster, the window asks for:

- **Folder** to open, and **Open in**: the VS Code app or the browser.
- The size of the job, as for a [compute node](compute-nodes.md).
- **Use these next time** and **Ask every time**. With **Ask every time**
  off, VS Code starts with your saved choices and the window shows its steps.

Select **Start VS Code**.

## The steps

1. **Job submitted.**
2. **Waiting for a compute node.** The window says why it waits and when Slurm expects it to
   start.
3. **Starting the VS Code tunnel.**
4. **Sign in to GitHub**, the first time only. Select **Copy**, then **Open
   GitHub**, paste the code there and authorize it. The window goes on by itself.
5. **Open in VS Code**. The first time, VS Code installs its server on the node, which takes a
   minute or two. Then the window says **VS Code is running**.

You can close the window at any step with **Keep going in the background**. VS Code still opens
when it is ready, and the GitHub code shows as a note if it's needed.

## One VS Code job per cluster

While a VS Code job is waiting or running, selecting VS Code shows that job instead of starting another one.
From there:

- **Open again**, or open it in the other place (app or browser).
- **Show log** shows the job's whole output in a terminal tab.
- **Stop job** asks first, then ends it.

After the job ends, the window says why and offers **Start a new one**.

## When a job can't start

If Slurm keeps the job waiting for a reason that never clears, for example a priority its queue doesn't take,
the window says so and offers **Stop and change**. It stops the job and opens the form again so you
can pick another queue or priority.

## The VS Code app or the browser

The VS Code app needs to be installed on your computer. The first time, it adds Remote Tunnels and asks you to
sign in with GitHub. Without the app, HPC Hub opens VS Code in the browser at vscode.dev.

!!! note

    VS Code keeps its GitHub sign-in in your home folder on the cluster, unencrypted, so a tunnel
    on a new node doesn't ask again. Run `code tunnel user logout` on the cluster to remove it.
