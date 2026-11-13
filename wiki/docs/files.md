# Files and transfers

Browse your folders on each cluster, preview and edit files, upload and download, and copy files between clusters.

## Browse a cluster

The **Browse** tab in **Files** shows one cluster at a time. Your places are on the left, and the path is at the top.

Select a file to preview it. PDFs, images, and text show next to the list. In a PDF you can search, zoom, look up words, and read aloud.

Right-click a file or folder for **Open**, **Edit in Code**, **Download**, **Rename**, **Copy path**, **Make a zip**, **Extract here**, or **Delete**.

!!! warning

    **Delete** asks you to confirm first. Deleting is permanent: there is no trash.

## Upload and download

Right-click empty space in the folder for **Upload files here** and **New folder**.

Select **Download** on a file or folder to save it on your computer.

## Copy files between clusters

Copy a file or folder from one cluster to a folder on another. Both clusters have to be connected.

!!! note

    Two clusters with a VPN each can be connected at the same time, each through its own VPN. See [First sign-in](first-sign-in.md#connect).

1. Select **Copy, then paste on any cluster** on the file or folder.
2. Go to the folder on the other cluster and select **Paste here**.
3. Select **How**:
    - **Through this laptop**: keep HPC Hub open and keep the computer awake until the copy finishes.
    - **Globus**: the clusters copy the files to each other. The transfer keeps going after you close HPC Hub. If Globus is not set up yet, follow [Set up Globus](#set-up-globus) first.

## Follow a transfer

The **Transfers** tab lists copies through this laptop and Globus transfers. It shows progress for each one. You can select **Cancel transfer** or **Open in Globus**.

## Set up Globus

A Globus transfer copies files from one cluster to another and keeps going after you close HPC Hub. You set this up once.

1. At app.globus.org, open Settings, then Developers, and register a free app for native applications distributed to users.
2. Name the app HPC Hub and add the redirect `https://auth.globus.org/v2/web/auth-code`.
3. Copy the Client ID. Under **Set up Globus**, paste it and select **Save**.
4. Sign in to Globus in your browser with your organization's login. If Globus shows a code, paste it into HPC Hub.
5. HPC Hub finds each cluster's Globus collection. If it cannot, pick the collection from the list.
6. When a collection needs your consent, select **Allow**.

On some clusters the collection only works while Globus Connect runs there. HPC Hub tells you, and offers to start it on the login node.
