# Files and transfers

Browse your folders on each cluster, preview and edit files, upload and download, and copy between clusters.

## Browse

The **Browse** tab of **Files** shows one cluster at a time: your places on the left,
the path at the top. Select a file to preview it; PDFs, images and text show next to the list. The PDF viewer can
search, zoom, look words up and read aloud.

Right-click a file or folder for **Open**, **Edit in Code**,
**Download**, **Rename**, **Copy path**, **Make a zip** or
**Extract here**, and **Delete**. Delete asks first and is permanent: there is no
trash.

## Upload and download

Right-click empty space for **Upload files here** and **New folder**. Use
**Download** on a file or folder to save it on your computer.

## Copy between clusters

1. Choose **Copy, then paste on any cluster** on a file or folder.
2. Go to the other cluster's folder and choose **Paste here**.
3. Pick **How**:
   - **Through this laptop**: keep HPC Hub open and the computer awake until it's done.
   - **Globus**: cluster to cluster. It keeps going after HPC Hub closes.

Both clusters have to be connected. On a computer only one university VPN runs at a time, so two clusters that
both need a VPN can't be connected together; use Globus between them.

## Follow a transfer

The **Transfers** tab lists copies through this laptop and Globus transfers, with progress,
**Cancel transfer** and **Open in Globus**.

## Set up Globus

Globus needs a one-time setup:

1. **Make a free Globus app id.** At app.globus.org, go to Settings, Developers, and register an
   app for native applications distributed to users. Name it HPC Hub and add the redirect
   `https://auth.globus.org/v2/web/auth-code`. Paste its Client ID under **Set up Globus** and
   select **Save**.
2. **Sign in to Globus** with your university login, in your browser. If Globus shows a code, paste
   it into the app.
3. HPC Hub finds each cluster's Globus collection. If it can't, pick it from the list.
4. When a collection needs your consent, select **Allow**.

On some clusters the collection only works while Globus Connect runs there. HPC Hub says so and offers to start
it on the login node.
