# Compute nodes and queues

A compute node is a computer you use for a set time. HPC Hub asks Slurm for one with the size you choose and shows the time left.

## Get a node

With **Get a compute node when I connect** on, a node comes with every connect. Otherwise select
**Get one** on the cluster card, or **Compute node** in its **⋮**
menu. The window has:

- **Size**: **Light CPU** (2 cores, 8 GB), **Heavy CPU** (8 cores,
  32 GB) or **GPU**, as a starting point.
- **Cores**, **Memory** and **Time**, up to what the queue allows.
- **Queue and priority**: see [below](#queues-and-priorities).
- **Cost**: the SUs it costs, where the cluster bills.

Select **Get node**. The node is a Slurm job, so it also shows on [Jobs](jobs.md).
It may wait in the queue before it starts.

## Queues and priorities

**Queue and priority** has three choices, read from Slurm after you connect:

- **Queue**: which nodes and time limits the job uses. Queues of GPU nodes are listed with the
  **GPU** size, not the CPU sizes. Queues only for other groups are hidden.
- **Priority**: how the job is billed and how soon it starts.
- **Group to bill**: the account the hours go to. Empty means your default group.

HPC Hub keeps the choices consistent:

- A queue that takes only its own priority (a debug queue, for example) switches the priority to it and says
  so.
- A queue of GPU nodes adds a GPU to the request and switches the size to **GPU**.
- A combination Slurm would never start can't be sent.

**Learn about queues**, at the top of the queue list, opens the
[Limits](usage.md#limits) table.

### Whole-node queues

On some queues you always get whole nodes. The queue's line says **You always get whole nodes, even if you
ask for fewer cores**, and the cost is counted per node. Pick such a queue when you can use the whole
machine. Some queues also say **Other jobs can stop yours**: save often there.

## Time left

The card shows your node and its time left, for example **On node n0123** · job 123456 · 3 h
20 min left. About 15 minutes before the end, HPC Hub sends a notification. When the time is up, Slurm ends the
job, and everything on that node stops, including its terminals.

**started elsewhere** means the node came from another job you already had (the **Reuse a
node you already have** setting).

## Give a node back

**Release node** in the card's **⋮** menu ends the job early. It asks first:
anything running on it stops, but you stay connected. **Disconnect** releases the node too. Quitting
the app does not; use **Settings**, **Disconnect all and quit** for that.

## The maintenance warning

Slurm won't start a job that would still run when booked maintenance begins. If the time you ask for runs into
maintenance, the window says so before you send the request:

!!! warning

    **Maintenance starts Tue, Nov 10 at 7:50 AM EST.** A 12 h job can't finish
    before then, so it would wait until maintenance is over. Shortened, it can start now.

Choose **Shorten to** a time that ends before it, or **Keep** your time
**and wait**. Nothing changes unless you shorten it.
