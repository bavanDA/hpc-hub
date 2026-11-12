# Jobs

Open Jobs, pick a cluster, and select a job to see its state, its output files and why it waits.

## See your jobs

Pick the cluster at the top, then under **Which jobs**:

- **My jobs**: running and waiting now.
- **My group**: everyone in your groups.
- **My history (7 days)**: your jobs from the last week, finished ones too.
- **All jobs**: everyone's jobs on the cluster.

**State** filters by running, waiting, finished and so on. The search box finds a job by id,
name, person or queue, for example `jdoe`.

Select a job for its details: time used, folders and output files (each with **Copy path**), and
**All fields** for everything Slurm knows.

## Submit a job

Open your Slurm script in **Code** (from Files, a project or a job's folder). The bar above a
Slurm script has **Submit job**. The new job shows up here.

## Why a job waits

The reason is written out in plain words, for example:

- **Waiting: higher-priority jobs go first**
- **Waiting: not enough free nodes yet**
- **Waiting: maintenance has to finish first**
- **Waiting: your group is out of SUs**
- **Won't start: longer than this queue allows**

## Cancel a job

The **⋮** on a row has **Cancel job**, which asks first. To cancel several, tick
them and use the bar that appears. Cancelling a job stops everything running in it. For the node HPC Hub got for
you, this is **Release node**, and your terminals on that node stop too.

## Notifications

While a cluster is connected, HPC Hub checks your jobs about once a minute and tells you when one ends.
Selecting the notification opens Jobs.
