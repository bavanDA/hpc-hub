# First sign-in

Choose your clusters, set up your login, and choose the resources to ask for when you connect.

## Choose your clusters

On **Welcome to HPC Hub**, select each cluster where you have an account, then
**Continue**. You can show or hide them later in **Settings**, under
**Clusters**.

## Set up your login

### Wulver at NJIT

Enter your UCID and password. If you type an NJIT email such as `ab123@njit.edu`, HPC Hub uses
`ab123`.

### Bouchet at Yale

Enter your NetID. Yale uses an SSH key instead of a password:

1. Select **Create key**, or **Use a key I already have**.
2. Select **Copy**, then **Open key page**. Paste the key on Yale's page, then select
   **I pasted it**.
3. Test the key. Yale can take up to 10 minutes to accept a new one.

Yale's key page only loads on campus or on the VPN. **Connect VPN only** in the cluster card's
**⋮** menu gets you there from elsewhere. Yale's VPN has its own Microsoft sign-in, set under
**Server and VPN** in the cluster's settings.

### Expanse at SDSC

Use your ACCESS username. **Sign in with the portal** sets up access without storing a password.
You can also use your ACCESS password. Expanse asks for a code from your authenticator app when you connect;
**Set up your authenticator app** shows how.

### The login check

When you select **Continue** with a password, HPC Hub checks it with the cluster before going on.
This does not send a Duo push. If the password is wrong, the step says so and you can type it again.

If the cluster can't be reached from your network yet, for example before the VPN is up, the step says so and
lets you go on. Your login is then checked when you connect.

**Remember password** keeps the password in your computer's keyring. Turn it off to type it each
time you open HPC Hub. **Do this later** skips the step until you connect.

## Choose your compute resources

- **Get a compute node when I connect**: on, HPC Hub asks for a node each time you connect. Off,
  you get one later from the cluster card.
- The size: **Light CPU**, **Heavy CPU** or **GPU**, then
  **Cores**, **Memory** and **Time**.
- **Ask before each request**: shows these choices each time, so you can change them.

See [Compute nodes and queues](compute-nodes.md) for queues, priorities and cost. Select
**Continue**, or **Done** for the last cluster.

## Connect

1. On **Clusters**, select **Connect** on the cluster card.
2. Complete any VPN setup or web sign-in that opens.
3. Approve Duo, or enter the code from your authenticator app, if the cluster asks.
4. If you asked for a compute node, wait for Slurm to give you one. The card shows each step.

If the cluster refuses your password, a **Wrong password** window opens with the username it
tried. Type the password again and select **Try again**. HPC Hub stops after one try, so your account
isn't locked.

On a computer, only one university VPN can run at a time. HPC Hub asks before switching to another one.

## Change a saved login later

Select the gear on the cluster card. **Sign-in** changes your login or forgets a saved password.
**Compute node** changes the resources to ask for. **Advanced** has **Server and
VPN**, **VS Code job** and **Agents**.

!!! note

    Your saved VPN password is only typed into your university's own sign-in pages or a known
    sign-in provider, over https.
