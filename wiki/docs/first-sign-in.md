# First sign-in

The first time you open HPC Hub, you choose your clusters and how you sign in. You also choose the compute resources to ask for when you connect.

## Choose your clusters

Tell HPC Hub which clusters you already have an account on.

1. On **Welcome to HPC Hub**, select each cluster where you have an account.
2. Select **Continue**.

You can show or hide clusters later in **Settings**, under **Clusters**.

## Set up how you sign in

Each cluster uses its own account.

### Wulver at NJIT

Wulver signs you in with your UCID and password.

Enter your UCID and password. If you type an NJIT email such as `ab123@njit.edu`, HPC Hub uses `ab123`.

### Bouchet at Yale

Yale uses an SSH key instead of a password.

1. Enter your NetID.
2. Select **Create key**, or **Use a key I already have**.
3. Select **Copy**.
4. Select **Open key page**.
5. Paste the key on Yale's page.
6. Select **I pasted it**.
7. Test the key.

!!! note

    Yale can take up to 10 minutes to accept a new key. Yale's key page only loads on campus or on Yale's VPN. From elsewhere, select **Connect VPN only** in the cluster card's **⋮** menu. Yale's VPN has its own Microsoft sign-in, set under **Server and VPN** in the cluster's settings.

### Expanse at SDSC

Expanse uses your ACCESS username.

**Sign in with the portal** sets up access without storing a password. You can also use your ACCESS password.

Expanse asks for a code from your authenticator app when you connect. **Set up your authenticator app** shows how.

## Check your password

When you select **Continue** with a password, HPC Hub checks it with the cluster before going on. This check does not send a Duo push.

If the password is wrong, the step says so and you can type it again.

If HPC Hub can't reach the cluster yet, for example because it's only reachable through its VPN and the VPN isn't on, it can't check the password. The step says so and stays. Select **Continue without checking** to go on: the password is checked when you connect, and if it's wrong you type it again then.

**Remember password** keeps the password in your computer's keyring. Turn it off to type the password each time you open HPC Hub.

**Do this later** skips this step until you connect.

## Choose your compute resources

These choices are what HPC Hub requests when you want a compute node as you connect.

- **Get a compute node when I connect**: when this is on, HPC Hub asks for a node each time you connect. When it is off, you get one later from the cluster card.
- The size: **Light CPU**, **Heavy CPU**, or **GPU**, then **Cores**, **Memory**, and **Time**.
- **Ask before each request**: shows these choices each time, so you can change them.

See [Compute nodes and queues](compute-nodes.md) for queues, priorities, and cost.

Select **Continue**. For the last cluster, select **Done**.

## Connect

You connect from the cluster card. The card shows each step.

1. On **Clusters**, select **Connect** on the cluster card.
2. Complete any VPN setup or web sign-in that opens.
3. Approve Duo, or enter the code from your authenticator app, if the cluster asks.
4. If you asked for a compute node, wait for Slurm to give you one.

If the cluster refuses your password, the **Wrong password** window opens with the username it tried.

1. Type the password again.
2. Select **Try again**.

HPC Hub stops after one try, so your account is not locked.

!!! note

    Several clusters' VPNs can run at the same time on Windows, macOS, and Linux, as long as each uses split tunnel. Split tunnel is the default: only that cluster's traffic and its own domain names go through its VPN, and the rest of your internet stays as it is. HPC Hub asks before switching only when one of the VPNs sends all your traffic through itself. That is when split tunnel is turned off in that cluster's settings.

## Change a saved sign-in later

The gear on the cluster card is where you change a saved sign-in or the resources you ask for. Select the gear.

**Sign-in**
:   Changes your sign-in, or forgets a saved password.

**Compute node**
:   Changes the resources to ask for.

**Advanced**
:   Has **Server and VPN**, **VS Code job**, and **Agents**.

!!! note

    Your saved VPN password is only typed into your organization's own sign-in pages or a known sign-in provider, over https.
