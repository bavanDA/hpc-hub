# Questions and answers

Privacy, cost, and what keeps running when you close the app.

## Where are my passwords kept?

In your system's keyring: GNOME Keyring on Linux, the Keychain on macOS, Credential Manager on Windows, and an
encrypted file with its key in the Keystore on Android. Never in plain text or in the app's settings files.

## What does HPC Hub connect to?

Your clusters, their VPN and sign-in pages, GitHub to check for updates, and services you choose to use, such
as Globus, an AI agent's company, or the PDF viewer's dictionary and read aloud. There is no tracking and no HPC
Hub account. A [problem report](report-a-problem.md) is only sent when you select Send.

## Does HPC Hub cost SUs?

The app doesn't. Your compute node, VS Code and agents are Slurm jobs, billed like any other job by the queue
and priority you pick. The node window shows the cost first.

## What keeps running when I close the app?

- **Closing the app**: terminals, agents, VS Code and your compute node keep running until you stop
  them or their time runs out. Globus transfers and backup copies go on. Copies through this laptop stop.
- **Disconnecting**: releases the node HPC Hub got for you. VS Code jobs and jobs you submitted keep
  running.
- **Stopping a job**: ends everything in it.

## Can I use a cluster that isn't listed?

HPC Hub has Wulver, Bouchet and Expanse built in. A new cluster is added to HPC Hub itself: one file in
`hpc_hub/clusters/` describes it. See
[CONTRIBUTING.md](https://github.com/bavanDA/hpc-hub/blob/main/CONTRIBUTING.md) for the steps and the
pull request.

## Can I use the phone and the computer at the same time?

Yes. Both see the same sessions and marks. Duo asks on each device when it connects.

## Why does my system warn me when I open the app?

The installers are not signed yet. See [Install and update](install.md).

## Is it open source?

Yes, under the MIT license, on [GitHub](https://github.com/bavanDA/hpc-hub).
