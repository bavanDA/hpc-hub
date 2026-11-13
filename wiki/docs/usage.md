# Usage and SUs

Check your group's service units and who used them. You can also see your storage, how busy the queues are, and what each queue allows.

## What an SU is

An SU (service unit) is the unit your cluster charges for work. Rates depend on the cluster, the queue, and the resources.

Your group is your lab's allocation. It has a number of SUs, and jobs billed to it use those SUs.

## Pick a cluster and a tab

Everything on this page is for one cluster: the cluster you pick at the top.

1. Pick the cluster at the top.
2. Select a tab.

### Overview

Overview shows one card for each group, so you can see how many SUs are left and who used them.

Each card shows **SUs left**, a bar of what is used with your part in it, and an estimate of how long the SUs last at the pace of past use.

A red tag says **Near the limit** or **Used up**.

Select a card to see who used the SUs.

### Hours

Hours shows the hours used for one group and one period, and **Who used it**.

Select a person to see their jobs.

### Storage

Storage shows your quotas and how full each one is.

Scratch rows say when files are deleted, and they show **See what is at risk**. See [Back up scratch](backup.md).

### Queues

Queues shows how busy each queue is now: busy CPUs, running jobs, and waiting jobs.

!!! note

    This does not promise a start time.

## Limits

Use this table to see the most one job can ask for on each queue you can use. HPC Hub reads the limits from Slurm.

**Learn about queues** in the node window opens this table too.

| Column | What it says |
| --- | --- |
| Queue | The name, whether it is the default, and its nodes. Where they apply, the row also says *whole nodes only* or *other jobs can stop yours*. |
| Longest time | The longest a job may run, and the time you get if you do not ask for one. |
| Nodes, Cores | The most one job may use. |
| Memory per node | The memory limit, and the memory per core where the queue sets one. |
| GPUs per node | How many and which kind, on clusters with GPUs. |
| Cost an hour | The cost in SUs per core, GPU, or node, or *Free*. |

**Priorities**, under the table, lists each priority's longest time and caps. A job's priority can set a shorter time or a lower cap than its queue.

## When a number is missing

Clusters keep different records. Where a cluster does not report a number, HPC Hub says so instead of guessing.
