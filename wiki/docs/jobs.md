# Jobs

See the jobs on a cluster, open their output files, and read why a job is waiting. You can also submit a Slurm script, cancel a job, and get a notice when a job ends.

## See your jobs

Jobs lists work on one cluster. Pick the cluster, then choose whose jobs to show.

1. Open **Jobs**.
2. Pick the cluster at the top.
3. Under **Which jobs**, choose a view.

**My jobs**
: Jobs that are running or waiting now.

**My group**
: Jobs from everyone in your groups.

**My history (7 days)**
: Your jobs from the last week, including finished ones.

**All jobs**
: Everyone's jobs on the cluster.

**State** filters the list by running, waiting, finished, and similar states. The search box finds a job by id, name, person, or queue. For example, search for `jdoe`.

Select a job to open its details. You see the time used, the folders, and the output files. Each folder and each output file has **Copy path**. **All fields** shows everything Slurm knows about the job.

## Submit a job

You submit a job from a Slurm script open in **Code**.

1. Open the script in **Code** from **Files**, from a project, or from a job's folder.
2. Select **Submit job** in the bar above the script.

The new job appears in **Jobs**.

## Ask for what a job needs

Memory and cores a job asks for are held for it while it runs, even when it doesn't use them, and other people's jobs wait. HPC Hub measures every job of yours that finishes, from Slurm's own records, so you don't have to do anything.

- A finished job's details show **What it used**, for example `38 GB of 256 GB asked for`, and what to ask for next time.
- When a script open in **Code** asks for much more than its earlier runs used, a line above it says so, with a button such as **Use 46 GB** that changes its `#SBATCH` line. When a run ran out of memory, it suggests more. You can always submit the script as it is.
- A job that takes whole nodes blocks nobody by asking for extra memory, so HPC Hub only mentions it.

The suggestion is the most memory earlier runs used, plus 20% (more when runs vary or one ran out of memory), and the cores that were really busy.

On the cluster, `hpchub-size` shows the same, with the words you would give `sbatch`:

```sh
hpchub-size run.sh --plan-only
hpchub-size --mem=64G run.sh
```

HPC Hub puts `hpchub-size` in `~/.local/bin` and its history in `~/.hpc-hub/job-sizes.json` when you start an agent, and tells Claude, ChatGPT and Antigravity to check it before they submit a job (in `~/.claude/CLAUDE.md`, `~/.codex/AGENTS.md` and `~/.gemini/GEMINI.md`). If you delete that note, it stays deleted.

## Why a job waits

When a job has not started, Jobs writes the reason in plain words. For example:

- Waiting: higher-priority jobs go first
- Waiting: not enough free nodes yet
- Waiting: maintenance has to finish first
- Waiting: your group is out of SUs
- Won't start: longer than this queue allows

## Cancel a job

Cancel a job to stop it. HPC Hub asks you to confirm first.

!!! warning

    Cancelling a job stops everything running in it. When the job is a node HPC Hub got for you, the action is **Release node**. Your terminals on that node stop too.

1. Select **⋮** on the job's row.
2. Select **Cancel job**.
3. Confirm when HPC Hub asks.

To cancel several jobs, tick them and use the bar that appears.

## Notifications

While a cluster is connected, HPC Hub checks your jobs about once a minute and tells you when one ends. Select the notification to open **Jobs**.
