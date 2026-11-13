# Troubleshooting

This page helps you when a cluster won't connect, a password is refused, VS Code doesn't open, or a terminal closes. Find the situation below and follow the steps.

## Can't reach the VPN or the cluster on some networks

Some networks block VPN and SSH connections, such as guest Wi-Fi, hotel or conference networks. Then the cluster card can't reach the cluster. The card may say something like "Can't reach Wulver from this network. Is the VPN on?"

1. Try another network, or your phone's hotspot.
2. Select **Try again**.

## The cluster refuses my password

A **Wrong password** window opens with the username it tried.

!!! note
    On Expanse, also check the code from your authenticator app.

1. Check the username.
2. Type the password again.
3. Select **Try again**.

## Duo timed out

Duo pushes expire after about a minute.

1. Check that the Duo app on your phone can receive notifications.
2. Select **Try again** or **Send a new push**.

## VS Code doesn't open

The VS Code window shows where the session is. If it is waiting for a node, the reason is there. See [Waiting a long time for a node](#waiting-a-long-time-for-a-node).

The first time, sign in to GitHub with the code the window shows.

The first open installs VS Code's server on the node. That takes a minute or two.

Select **Show log** to read everything the job printed.

If the job can't start:

1. Select **Stop and change**.
2. Pick another queue or priority.

Read more on the [VS Code](vscode.md) page.

## Waiting a long time for a node

A smaller node, a shorter time, or another queue often starts sooner.

1. Open **Usage**.
2. Select **Queues** to see how busy each queue is.
3. Check for a [maintenance warning](compute-nodes.md#the-maintenance-warning).

## A pasted script closed my terminal

The script most likely has `set -e`. Pasted into a terminal, that ends the terminal's own shell when a command fails. Save the script to a file and run it with bash, in a new terminal.

1. Open a new terminal.
2. Run `nano setup.sh`.
3. Paste the script.
4. Save the file.
5. Run `bash setup.sh`.

## Yale hasn't picked up my key

Yale can take up to 10 minutes to accept a new key.

1. Wait.
2. Select **Try again**.

Yale's key page only loads on campus or on the VPN. To open that page from somewhere else:

1. Open the cluster card's **⋮** menu.
2. Select **Connect VPN only**.

## "The server looks different from last time"

!!! warning
    The cluster's server identity changed since you last connected. Check with the cluster's HPC team before you connect.

## The VPN won't start on Windows or macOS

The first time you connect the VPN, Windows or macOS asks once for permission for the VPN helper. If you declined, approve it the next time you connect.

1. Connect again.
2. Approve the VPN helper when asked.

## The phone drops the connection in the background

The phone can drop the connection while HPC Hub is in the background. Turn the phone settings on so the connection stays up. Terminal sessions keep running on the cluster either way.

1. Open **Settings** on the phone.
2. Under **On the phone**, turn on **Stay connected in the background** and **Run without battery limits**.
3. Allow HPC Hub in the phone's own battery settings if it asks.

## Globus copies don't start

A Globus copy needs the one-time setup, Globus Connect running, and your consent.

1. Check the one-time [Globus setup](files.md#set-up-globus).
2. Let HPC Hub start Globus Connect when it asks.
3. When Globus needs your consent, select **Allow**.

## Still stuck?

When you still need help, [report a problem](report-a-problem.md) from the app.
