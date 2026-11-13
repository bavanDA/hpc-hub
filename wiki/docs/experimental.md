# Experimental features

Use this page to turn on features that are still in progress, and to see what each one does. They are off by default.

!!! warning

    These features may change or break. Turn them on in **Settings**, under **Experimental**.

## Papers (LaTeX)

Papers is an editor for a LaTeX paper in a project on the cluster. The cluster builds the paper with latexmk, and git keeps a history of your changes.

1. Turn on **Papers**.
2. Open a project made as a **LaTeX paper**.

## Skills

A skill is a set of instructions for an agent. You add skills so the agents on each cluster follow them.

1. Open the **Skills** tab of **Agents**.
2. Add a skill from HPC Hub's own set, or from a git repository.

## Scheduled agents

A scheduled agent runs a task at set times, for example every night at 02:00. Each run is a Slurm job, so the task runs while your laptop is off and uses your allocation like any other job.
