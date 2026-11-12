# Back up scratch

Check which scratch files may be deleted, review a plan, and copy what you need to your project folder.

## Why

Most clusters delete old files in scratch. HPC Hub shows the rule for your cluster, from its docs, and uses the
number the cluster reports when it reports one. HPC Hub never touches files to make them look newer.

## Where to find it

- **Agents**, the **Backup** tab.
- **Usage**, **Storage**: **See what is at risk** on a scratch row.
- A note and a notification when files are close to deletion, with **See the plan**.

## The steps

1. **Check**: **Check my scratch** looks at every file. The time depends on how many
   files you have and how busy the cluster is; you can close the app meanwhile.
2. **At risk**: how many files go soon, how big they are and where.
3. **Plan**: each folder is **Keep** or **Leave out**; change any of
   them.
4. **Space**: how much of your project folder the copy uses. **Try it first** checks
   without copying.
5. **Copy**: runs on the cluster, so you can close the app. **Stop copy** keeps what was
   copied; starting again goes on from there.

At the end, the copy is compared with scratch: by checksum for smaller backups, and by size and time for larger
ones. Nothing in scratch is changed or deleted. A newer file replacing an older one in project keeps the old one in
`.hpc-hub-replaced`.

## Weekly check

**Reminders** can **Check scratch every week** at a time you choose. It runs on the
cluster and tells you what is at risk. It doesn't copy anything by itself.
