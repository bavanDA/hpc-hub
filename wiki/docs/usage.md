# Usage and SUs

Your group's SUs, who used them, your storage, how busy the queues are, and what each queue allows.

## What an SU is

An SU (service unit) is the unit your cluster charges for work. Rates depend on the cluster, the queue and the
resources. Your group (your lab's allocation) has a number of SUs, and jobs billed to it use them.

## The tabs

Pick the cluster at the top, then a tab.

### Overview

One card per group: **SUs left**, a bar of what is used with your part in it, and an estimate of
how long the SUs last at the pace of past use. A red tag says **Near the limit** or **Used
up**. Select a card to see who used it.

### Hours

For a group and a period: the hours used and **Who used it**. Select a person to see their jobs.

### Storage

Your quotas and how full each one is. Scratch rows say when files are deleted, with **See what is at
risk** ([Back up scratch](backup.md)).

### Queues

How busy each queue is now: busy CPUs, running jobs and waiting jobs. This doesn't promise a start time.

## Limits

The most one job can ask for on each queue you can use, read from Slurm. **Learn about queues** in
the node window opens this too.

| Column | What it says |
| --- | --- |
| Queue | The name, whether it is the default, its nodes, and *whole nodes only* or *other jobs can stop yours* where they apply. |
| Longest time | The longest a job may run, and the time you get if you don't ask. |
| Nodes, Cores | The most one job may use. |
| Memory per node | The memory limit, and memory per core where the queue sets one. |
| GPUs per node | How many and which kind, on clusters with GPUs. |
| Cost an hour | In SUs per core, GPU or node, or *Free*. |

**Priorities**, under the table, lists each priority's longest time and caps. A job's priority can
set a shorter time or a lower cap than its queue.

## When numbers are missing

Clusters keep different records. Where a cluster doesn't say, HPC Hub says so instead of guessing.
