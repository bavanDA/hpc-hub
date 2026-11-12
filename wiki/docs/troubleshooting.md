# Troubleshooting

What to do when a cluster won't connect, a password is refused, VS Code doesn't open, or a terminal closes.

## Can't reach the VPN or the cluster on some networks

The card says something like **Can't reach Wulver from this network. Is the VPN on?** Some
networks block VPN or SSH connections, such as guest Wi-Fi, hotels or conference networks. Try another network or
your phone's hotspot, then **Try again**.

## The cluster refuses my password

A **Wrong password** window opens with the username it tried. Check the username, type the
password again and select **Try again**. On Expanse, also check the code from your authenticator
app.

## Duo timed out

Duo pushes expire after about a minute. Make sure the Duo app on your phone can receive notifications, then
select **Try again** or **Send a new push**.

## VS Code doesn't open

- The VS Code window shows where it is. If it waits for a node, the reason is there; see
  [below](#waiting-a-long-time-for-a-node).
- The first time, sign in to GitHub with the code the window shows.
- The first open installs VS Code's server on the node. That takes a minute or two.
- **Show log** shows everything the job printed. If the job can't start,
  **Stop and change** lets you pick another queue or priority.

More on the [VS Code](vscode.md) page.

## Waiting a long time for a node

A smaller node, a shorter time or another queue often starts sooner. **Usage**,
**Queues** shows how busy each queue is. Also check for the
[maintenance warning](compute-nodes.md#the-maintenance-warning).

## A pasted script closed my terminal

The script most likely has `set -e`. Pasted into a terminal, it ends the terminal's own shell when a
command fails. Save it to a file and run it with bash, in a new terminal:

```
nano setup.sh      # paste the script, save
bash setup.sh
```

## Yale hasn't picked up my key

It can take up to 10 minutes. Wait and select **Try again**. Yale's key page only loads on campus
or on the VPN; use **Connect VPN only** from the card's **⋮** menu.

## "The server looks different from last time"

The cluster's server identity changed since you last connected. Check with the cluster's HPC team before you
connect.

## The VPN won't start on Windows or macOS

The first VPN connect asks for permission once, for the VPN helper. If you declined, connect again and approve
it.

## The phone drops the connection in the background

Turn on both settings in **Settings**, **On the phone**, and allow HPC Hub in the
phone's own battery settings. Terminal sessions keep running on the cluster either way.

## Globus copies don't start

Check the one-time [Globus setup](files.md#set-up-globus), let HPC Hub start Globus Connect when it
asks, and select **Allow** when Globus needs your consent.

## Still stuck?

[Report a problem](report-a-problem.md) from the app.
