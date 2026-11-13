# Questions and answers

This page answers common questions about HPC Hub: where your passwords are kept, what the app connects to, what costs SUs, and what keeps running when you close the app. It also covers clusters that are not built in, using your phone and computer together, the warning when you open the app, and the license.

## Where are my passwords kept?

In your system's keyring. HPC Hub never stores them in plain text or in the app's settings files.

| System | Where passwords are kept |
| --- | --- |
| Linux | GNOME Keyring |
| macOS | Keychain |
| Windows | Credential Manager |
| Android | An encrypted file, with its key in the Keystore |

## What does HPC Hub connect to?

HPC Hub connects to your clusters, including their VPN and sign-in pages, and to GitHub to check for updates. When you choose to use them, it also connects to services such as Globus, an AI agent's company, or the PDF viewer's dictionary and read aloud.

There is no tracking, and there is no HPC Hub account. A [problem report](report-a-problem.md) is sent only when you select **Send report**.

## Does HPC Hub cost SUs?

The app does not. Your compute node, VS Code, and agents are Slurm jobs. The cluster bills them like any other job, by the queue and priority you pick. The node window shows the cost first.

## What keeps running when I close the app?

What happens depends on whether you close the app, disconnect, or stop a job.

Closing the app
:   Terminals, agents, VS Code, and your compute node keep running until you stop them or their time runs out. Globus transfers and backup copies continue. Copies through this laptop stop.

Disconnecting
:   HPC Hub releases the node it got for you. VS Code jobs and jobs you submitted keep running.

Stopping a job
:   Everything in that job ends.

## Can I use a cluster that isn't listed?

HPC Hub has Wulver, Bouchet, and Expanse built in. A new cluster is added to HPC Hub itself: one file in `hpc_hub/clusters/` describes it. See [CONTRIBUTING.md](https://github.com/bavanDA/hpc-hub/blob/main/CONTRIBUTING.md) for the steps and the pull request.

## Can I use the phone and the computer at the same time?

Yes. You see the same sessions and marks on both. Duo asks on each device when that device connects.

## Why does my system warn me when I open the app?

The installers are not signed yet. See [Install and update](install.md).

## Is it open source?

Yes. HPC Hub is under the MIT license. The source is on [GitHub](https://github.com/bavanDA/hpc-hub).
