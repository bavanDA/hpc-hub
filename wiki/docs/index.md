# HPC Hub

HPC Hub connects your computer to research computing clusters. Use it to get a compute node, open tools on it, manage files and check jobs.

## Start here

You need an account on a supported cluster before you can connect.

1. [Install HPC Hub](install.md) on your computer.
2. Follow [First sign-in](first-sign-in.md) to choose your clusters and set up your login.
3. Read [Compute nodes and queues](compute-nodes.md) to choose resources for your work.
4. Open a [terminal](terminals.md) or [VS Code](vscode.md) on your cluster card.

If setup fails, see [Troubleshooting](troubleshooting.md).

## Supported clusters

- **Wulver** at NJIT
- **Bouchet** at Yale
- **Expanse** at SDSC

Choose the ones you use on the first start. You can show or hide them later in **Settings**. To
add another cluster to HPC Hub, see [this question](faq.md#can-i-use-a-cluster-that-isnt-listed).

HPC Hub runs on Windows, macOS and Linux. See [Android app](phone.md) for the phone.

## Four terms to know

Cluster
:   A group of computers shared by researchers. HPC means high performance computing.

Login node
:   The shared computer you reach when you sign in. Use it to edit files and submit jobs. Run demanding work on
a compute node.

Compute node
:   A computer that runs your work with the resources given to your job.

Job
:   A request for resources for a set time. Slurm, the cluster's scheduler, decides when it starts.

Work on a compute node stops when its job ends. Closing HPC Hub does not stop your jobs.

## After you connect

- [Jobs](jobs.md): check progress, see output paths and cancel jobs.
- [Files and transfers](files.md): browse, edit, upload, download and copy between clusters.
- [Projects](projects.md): save folders and reopen them in your tools.
- [Back up scratch](backup.md): find files that may be deleted and copy the ones you need.
- [Usage and SUs](usage.md): check your group's allocation and storage.
- [AI agents](agents.md): run Claude, ChatGPT, Antigravity or Cursor on a compute node.
