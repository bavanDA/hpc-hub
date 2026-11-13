# Back up scratch

Check which files in scratch may be deleted, review a plan, and copy what you need into your project folder.

## Why scratch files get deleted

Most clusters delete old files in scratch. HPC Hub shows the rule for your cluster, from that cluster's docs. When the cluster reports a number, HPC Hub uses that number.

HPC Hub never changes files to make them look newer.

## Where to start

You can start a backup from three places:

- In **Agents**, open the **Backup** tab.
- In **Usage**, open **Storage**, then select **See what is at risk** on a scratch row.
- When files are close to deletion, HPC Hub shows a note and a notification. Select **See the plan**.

## Copy the files you want to keep

The check finds files that may be deleted soon. You then choose which folders to copy into your project folder.

!!! tip

    The check and the copy run on the cluster. You can close the app while they run.

1. Select **Check my scratch**. HPC Hub looks at every file. How long this takes depends on how many files you have and how busy the cluster is.
2. Review how many files may be deleted soon, how big they are, and where they are.
3. Set each folder to **Keep** or **Leave out**. Change any folder you want.
4. Review how much of your project folder the copy uses.
5. Select **Try it first** if you want to check the plan without copying files.
6. Select **Copy**. The button shows the size, for example Copy 12 GB to project.

To stop a copy, select **Stop copy**. Files that were already copied stay in your project folder. If you start the copy again, it continues from there.

## After the copy finishes

HPC Hub compares the copy with scratch. Smaller backups are compared by checksum. Larger backups are compared by size and time.

!!! note

    Nothing in scratch is changed or deleted.

If a newer file replaces an older file in your project folder, HPC Hub keeps the older file in `.hpc-hub-replaced`.

## Check scratch every week

This check runs on the cluster and tells you what is at risk. It does not copy anything by itself.

In **Reminders**, choose **Check scratch every week** and a time.
