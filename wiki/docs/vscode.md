# VS Code

Run VS Code on a compute node, as a Slurm job of its own, and open it on your computer, in the VS Code app or in the browser. HPC Hub shows each step in a window until VS Code is ready.

## Start VS Code

Select **VS Code** on a cluster card, or open a project with VS Code. If a VS Code job is already waiting or running on that cluster, HPC Hub shows that job. See [One VS Code job per cluster](#one-vs-code-job-per-cluster).

If the cluster has no VS Code job yet, the window asks you to set up the job.

1. Choose the **Folder** to open.
2. Under **Open in**, choose the VS Code app or the browser.
3. Choose the size of the job, the same way you choose a [compute node](compute-nodes.md).
4. Turn on **Use these next time** to save these choices. Turn off **Ask every time** to skip this window next time: VS Code then starts with your saved choices and the window shows the steps.
5. Select **Start VS Code**.

## Follow the progress

After VS Code starts, the window shows these steps:

1. **Job submitted.**
2. **Waiting for a compute node.** The window says why the job waits and when Slurm expects it to start.
3. **Starting the VS Code tunnel.**
4. **Sign in to GitHub**, the first time only.
5. **Open in VS Code.** The first time, VS Code installs its server on the node. That takes a minute or two. Then the window says **VS Code is running**.

The first time, sign in when the window reaches **Sign in to GitHub**:

1. Select **Copy**.
2. Select **Open GitHub**.
3. Paste the code on GitHub and authorize it.

The window continues on its own.

!!! tip

    Select **Keep going in the background** to close the window at any step. VS Code still opens when it is ready. If the GitHub code is still needed, it shows as a note.

## One VS Code job per cluster

While a VS Code job is waiting or running, selecting **VS Code** shows that job. From that window:

- Select **Open again**, or open it in the other place (the app or the browser).
- Select **Show log** to see the job's whole output in a terminal tab.
- Select **Stop job**. HPC Hub asks first, then ends the job.

After the job ends, the window says why and offers **Start a new one**.

## When a job can't start

If Slurm keeps the job waiting for a reason that never clears, for example a priority that its queue does not take, the window says so and offers **Stop and change**.

1. Select **Stop and change**. The job stops and the form opens again.
2. Pick another queue or priority.

## The VS Code app or the browser

You can open VS Code in the app on your computer or in the browser. The app has to be installed on your computer. The first time, the VS Code app adds Remote Tunnels and asks you to sign in with GitHub. Without the app, HPC Hub opens VS Code in the browser at vscode.dev.

!!! note

    VS Code keeps its GitHub sign-in in your home folder on the cluster, unencrypted, so a tunnel on a new node does not ask again. Run `code tunnel user logout` on the cluster to remove it.
