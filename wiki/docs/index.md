# HPC Hub

Focus on your research, not on the cluster. HPC Hub makes cluster work simpler and faster, especially when you use several clusters at once: you connect your computer, get a compute node, open tools, manage files and check jobs.

## Start here

You need an account on a supported cluster before you can connect. These steps install HPC Hub, sign you in and open a tool on your cluster.

1. [Install HPC Hub](install.md) on your computer.
2. Follow [First sign-in](first-sign-in.md) to choose your clusters and sign in.
3. Read [Compute nodes and queues](compute-nodes.md) to choose resources for your work.
4. Open a [terminal](terminals.md) or [VS Code](vscode.md) on your cluster card.

If setup fails, see [Troubleshooting](troubleshooting.md).

## Supported clusters

These are the clusters HPC Hub includes. Choose the ones you use the first time you start HPC Hub. You can show or hide them later in **Settings**.

| Cluster | Organization |
| --- | --- |
| Wulver | NJIT |
| Bouchet | Yale |
| Expanse | SDSC |

To add a cluster that is not listed, see [Can I use a cluster that isn't listed?](faq.md#can-i-use-a-cluster-that-isnt-listed).

HPC Hub runs on Windows, macOS and Linux. For a phone, see the [Android app](phone.md).

## Terms to know

You will see these words in HPC Hub and in the rest of these docs.

Cluster
:   A group of computers shared by researchers. HPC means high performance computing.

Login node
:   The shared computer you reach when you sign in. Use it to edit files and submit jobs. Run demanding work on a compute node.

Compute node
:   A computer that runs your work with the resources given to your job.

Job
:   A request for resources for a set time. Slurm, the cluster's scheduler, decides when it starts.

!!! note
    Work on a compute node stops when its job ends. Closing HPC Hub does not stop your jobs.

## After you connect

Use these guides once a cluster is connected.

[Jobs](jobs.md)
:   Check progress, see output paths and cancel jobs.

[Files and transfers](files.md)
:   Browse, edit, upload, download and copy between clusters.

[Projects](projects.md)
:   Save folders and reopen them in your tools.

[Back up scratch](backup.md)
:   Find files that may be deleted and copy the ones you need.

[Usage and SUs](usage.md)
:   Check your group's allocation and storage.

[AI agents](agents.md)
:   Run Claude, ChatGPT, Antigravity or Cursor on a compute node.
