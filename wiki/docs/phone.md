# Android app

Sign in on your Android phone, keep HPC Hub connected, and open a terminal from there. The app has the same pages as the desktop app, and it is not in any store yet.

!!! note

    See [Install and update](install.md#android) for how to get it.

## Sign in by scanning

A QR code sends the sign-ins you choose from your computer to the phone.

1. On your computer, open **Settings** and select **Set up the phone app**. Or open a cluster card's **⋮** menu and select **Connect phone**.
2. Choose which sign-ins to send. With **Include passwords** off, the phone asks for each password.
3. Select **Show QR code**.
4. Scan the code with the phone.

The code carries the sign-ins you chose. The phone then connects on its own. Where a cluster uses Duo, Duo asks you on the phone. For clusters that use SSH keys, the phone gets a key of its own.

## Stay connected in the background

Android can close connections to save battery. Turn on both settings so HPC Hub stays connected.

1. Open **Settings**.
2. Under **On the phone**, turn on **Stay connected in the background**.
3. Turn on **Run without battery limits**.

## Notifications

Choose which events the phone tells you about.

1. Open **Settings**.
2. Under **Notifications**, turn on the events you want.

The list includes Duo waiting, a cluster connected, node time almost up, a job ended, a copy finished, scratch files close to deletion, and more.

## Terminals on the phone

Use a terminal on the phone the same way you do on the desktop. Touch controls cover scrolling, the keyboard, and the extra keys.

- Swipe to scroll.
- Tap to open the keyboard.
- The key row has **Esc**, **Tab**, **Ctrl**, **Alt**, and the arrow keys.
- The [timeline](terminals.md#the-timeline) and [marks](terminals.md#marks) work as they do on the desktop.

## VPN and passwords

The phone uses your cluster's VPN only for HPC Hub's own connections. You can stay connected to several clusters at once.

Your sign-ins stay in an encrypted file. The key for that file stays in the phone's Keystore.
