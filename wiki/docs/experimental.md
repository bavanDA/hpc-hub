# Experimental features Experimental

Parts of HPC Hub that are still taking shape. They are off by default.

!!! info "Experimental"

    Turn them on in **Settings**, under **Experimental**. They may change or
    break.

## Papers (LaTeX)

An editor for LaTeX papers in a project on the cluster, built there with latexmk, with git and a history of
changes. Turn on **Papers**, then open a project made as a **LaTeX paper**.

## Skills

A skill is a set of instructions for an agent. The **Skills** tab of **Agents** adds
them to the agents on each cluster, from HPC Hub's own set or a git repository.

## Scheduled agents

An agent runs a task at set times, for example every night at 02:00. Each run is a Slurm job, so it runs with
your laptop off and uses your allocation like any other job.
