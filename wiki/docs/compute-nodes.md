# Compute nodes and queues

Request a compute node, choose a queue and priority, and give the node back when you are done. A compute node is a computer you use for a set time: HPC Hub asks Slurm for one in the size you choose and shows the time left on the cluster card.

## Get a compute node

Turn on **Get a compute node when I connect** to request a node every time you connect. When that setting is off, request a node yourself:

1. Open the window with **Get one** on the cluster card, or with **Compute node** in the **⋮** menu.
2. Set the size, cores, memory, time, queue, and priority.
3. Select **Get node**.

The node is a Slurm job, so it also shows on [Jobs](jobs.md). It may wait in the queue before it starts.

### What you can set

**Size** is a starting point: **Light CPU** (2 cores, 8 GB), **Heavy CPU** (8 cores, 32 GB), or **GPU**. You can then change **Cores**, **Memory**, and **Time**, up to what the queue allows.

**Queue and priority** is covered in [Queues and priorities](#queues-and-priorities).

**Cost** is the SUs the request costs, on clusters that bill for them.

## Queues and priorities

**Queue and priority** has three choices. HPC Hub reads them from Slurm after you connect.

**Queue**
: Which nodes and time limits the job uses. Queues of GPU nodes are listed with the **GPU** size. **Light CPU** and **Heavy CPU** leave those queues out. Queues that only other groups can use are hidden.

**Priority**
: How the job is billed, and how soon it starts.

**Group to bill**
: The account the hours go to. Leave it empty to use your default group.

HPC Hub keeps the choices consistent:

- A queue that takes only its own priority (a debug queue, for example) switches the priority to that one and tells you.
- A queue of GPU nodes adds a GPU to the request and switches the size to **GPU**.
- A combination Slurm would never start cannot be sent.

**Learn about queues**, at the top of the queue list, opens the [Limits](usage.md#limits) table.

### Whole-node queues

On some queues you always get whole nodes. The queue's line says "You always get whole nodes, even if you ask for fewer cores", and the cost is counted per node. Pick a queue like that when you can use the whole machine.

Some queues also say "Other jobs can stop yours". Save your work often on those queues.

## Time left

The card shows your node and the time left, for example: On node n0123, job 123456, 3 h 20 min left.

About 15 minutes before the end, HPC Hub sends a notification. When the time is up, Slurm ends the job, and everything on that node stops, including its terminals.

"started elsewhere" means the node came from another job you already had. That is the **Reuse a node you already have** setting.

## Give a node back

**Release node** ends the job early. Anything running on the node stops, and you stay connected.

1. Open the **⋮** menu on the card.
2. Select **Release node**.
3. Confirm when HPC Hub asks.

**Disconnect** releases the node too. Quitting the app keeps the node. Open **Settings** and select **Disconnect all and quit** to disconnect and quit.

## The maintenance warning

Slurm starts a job only when that job can finish before booked maintenance begins. If the time you ask for runs into maintenance, the window says so before you send the request:

!!! warning

    Maintenance starts Tue, Nov 10 at 7:50 AM EST. A 12 h job can't finish before then, so it would wait until maintenance is over. Shortened, it can start now.

Do one of the following:

- Select **Shorten to**, with a time that ends before maintenance. The job can start now.
- Select **Keep 12 h and wait** (the button shows your time). The job waits until maintenance is over.

The time stays as you set it until you shorten it.
