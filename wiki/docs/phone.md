# Android app

The Android app has the same pages as the desktop, made for a phone. It is not in any store yet.

!!! note

    See [Install and update](install.md#android) for how to get it.

## Sign in by scanning

1. On your computer, open **Settings** in HPC Hub and choose **Set up the phone app**
   (or **Connect phone** in a cluster card's **⋮** menu).
2. Pick the logins to send. With **Include passwords** off, the phone asks for each password.
3. Select **Show QR code** and scan it with the phone.

The code carries the logins you chose. The phone then connects on its own; Duo asks on the phone where the
cluster uses it. For clusters that use SSH keys, the phone gets a key of its own.

## Stay connected in the background

Android can close connections to save battery. In **Settings**, **On the phone**,
turn on **Stay connected in the background** and **Run without battery limits**.

## Notifications

Choose which ones in **Settings**, **Notifications**: Duo waiting, a cluster
connected, node time almost up, a job ended, a copy finished, scratch files close to deletion, and more.

## Terminals on the phone

- Swipe to scroll; tap to open the keyboard.
- The key row has **Esc**, **Tab**, **Ctrl**, **Alt** and the
  arrows.
- The timeline and marks work as on the desktop.

## VPN and passwords

The phone uses the university VPN only for HPC Hub's own connections, and several clusters can be connected at
once. Logins are kept in an encrypted file whose key stays in the phone's Keystore.
