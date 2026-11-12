"""The wiki's text, one entry per page. Plain HTML fragments; build.py adds ids to h2 and h3."""

GROUPS = [
    ("Start here", ["home", "install", "first-sign-in"]),
    ("Run your work", ["compute-nodes", "terminals", "vscode", "jobs"]),
    ("Manage your work", ["files", "projects", "backup", "usage"]),
    ("Optional tools", ["agents", "phone", "experimental"]),
    ("Get help", ["troubleshooting", "report", "faq"]),
]

PAGES: dict[str, dict] = {}


def add(slug, file, nav, title, lead, body, experimental=False):
    PAGES[slug] = {"file": file, "nav": nav, "title": title, "lead": lead, "body": body,
                   "experimental": experimental}


add("home", "index.html", "Home", "HPC Hub",
    "HPC Hub connects your computer to research computing clusters. Use it to get a compute node, open tools on "
    "it, manage files and check jobs.",
    """
<h2>Start here</h2>
<p>You need an account on a supported cluster before you can connect.</p>
<ol>
<li><a href="install.html">Install HPC Hub</a> on your computer.</li>
<li>Follow <a href="first-sign-in.html">First sign-in</a> to choose your clusters and set up your login.</li>
<li>Read <a href="compute-nodes.html">Compute nodes and queues</a> to choose resources for your work.</li>
<li>Open a <a href="terminals.html">terminal</a> or <a href="vscode.html">VS Code</a> on your cluster card.</li>
</ol>
<p>If setup fails, see <a href="troubleshooting.html">Troubleshooting</a>.</p>

<h2>Supported clusters</h2>
<ul>
<li><strong>Wulver</strong> at NJIT</li>
<li><strong>Bouchet</strong> at Yale</li>
<li><strong>Expanse</strong> at SDSC</li>
</ul>
<p>Choose the ones you use on the first start. You can show or hide them later in <strong>Settings</strong>. To
add another cluster to HPC Hub, see <a href="faq.html#can-i-use-a-cluster-that-isn-t-listed">this question</a>.</p>
<p>HPC Hub runs on Windows, macOS and Linux. See <a href="phone.html">Android app</a> for the phone.</p>

<h2>Four terms to know</h2>
<dl class="terms">
<dt>Cluster</dt>
<dd>A group of computers shared by researchers. HPC means high performance computing.</dd>
<dt>Login node</dt>
<dd>The shared computer you reach when you sign in. Use it to edit files and submit jobs. Run demanding work on
a compute node.</dd>
<dt>Compute node</dt>
<dd>A computer that runs your work with the resources given to your job.</dd>
<dt>Job</dt>
<dd>A request for resources for a set time. Slurm, the cluster's scheduler, decides when it starts.</dd>
</dl>
<p>Work on a compute node stops when its job ends. Closing HPC Hub does not stop your jobs.</p>

<h2>After you connect</h2>
<ul>
<li><a href="jobs.html">Jobs</a>: check progress, see output paths and cancel jobs.</li>
<li><a href="files.html">Files and transfers</a>: browse, edit, upload, download and copy between clusters.</li>
<li><a href="projects.html">Projects</a>: save folders and reopen them in your tools.</li>
<li><a href="backup.html">Back up scratch</a>: find files that may be deleted and copy the ones you need.</li>
<li><a href="usage.html">Usage and SUs</a>: check your group's allocation and storage.</li>
<li><a href="agents.html">AI agents</a>: run Claude, ChatGPT, Antigravity or Cursor on a compute node.</li>
</ul>
""")


add("install", "install.html", "Install and update", "Install and update",
    "Install HPC Hub on your own computer. Nothing needs to be installed on the cluster.",
    """
<h2>Windows 10 and 11</h2>
<p>Open PowerShell and run:</p>
<pre><code>irm https://github.com/bavanDA/hpc-hub/releases/latest/download/install.ps1 | iex</code></pre>
<p>This downloads the newest HPC Hub installer from GitHub, checks it against the release's checksums, installs it
and opens the app. Running it again updates an existing install.</p>
<p>To install by hand, open the <a href="https://github.com/bavanDA/hpc-hub/releases">releases page</a>, download
the Windows <code>-setup.exe</code> under <strong>Assets</strong> and run it. If Windows shows <strong>Windows
protected your PC</strong>, select <strong>More info</strong>, then <strong>Run anyway</strong>.</p>

<h2>macOS</h2>
<p>The macOS build is for Macs with Apple silicon.</p>
<ol>
<li>Download the <code>.dmg</code> from the <a href="https://github.com/bavanDA/hpc-hub/releases">releases
page</a>.</li>
<li>Open it and drag HPC Hub to <strong>Applications</strong>.</li>
<li>Open HPC Hub. If macOS blocks it, open <strong>System Settings</strong>, then <strong>Privacy &amp;
Security</strong>, and select <strong>Open Anyway</strong>.</li>
</ol>

<h2>Linux</h2>
<p>Download an x86_64 build from the <a href="https://github.com/bavanDA/hpc-hub/releases">releases page</a> and
run the commands from the folder with the download.</p>
<ul>
<li><strong>AppImage</strong> (updates from inside the app):
<pre><code>chmod +x HPC-Hub_*_linux_x86_64.AppImage
./HPC-Hub_*_linux_x86_64.AppImage</code></pre></li>
<li><strong>Ubuntu or Debian</strong>: <code>sudo apt install ./HPC-Hub_*_linux_amd64.deb</code></li>
<li><strong>Fedora or RHEL</strong>: <code>sudo dnf install ./HPC-Hub_*_linux_x86_64.rpm</code></li>
</ul>

<h2>VPN setup</h2>
<p>Wulver and Yale use a university VPN.</p>
<ul>
<li><strong>Windows and macOS</strong>: the first time you connect, HPC Hub asks to set up its VPN helper. Select
<strong>Set up</strong> and approve the system prompt.</li>
<li><strong>Linux</strong>: install <code>openconnect</code>. Yale's web sign-in also needs
<code>python3-gi gir1.2-webkit-6.0</code> (Ubuntu, Debian) or <code>python3-gobject webkitgtk6.0</code>
(Fedora).</li>
</ul>
<div class="note"><p>On Windows and macOS, all your DNS goes through the university while the VPN is up. On
Windows, <strong>Disconnect</strong> doesn't sign you out on the VPN server; that session ends by itself.</p></div>

<h2>Update HPC Hub</h2>
<p>From version <strong>0.2.1</strong>, HPC Hub checks for new versions a little after it starts and twice a
day. When one is out, <strong>Update to</strong> and the version show in the sidebar. Select it, then
<strong>Update and restart</strong>.</p>
<p>To check now, open <strong>Settings</strong>, then <strong>About HPC Hub</strong>, then <strong>Check for
updates</strong>.</p>
<p>Your jobs keep running on the clusters while HPC Hub restarts. If an update fails, select <strong>Download by
hand</strong>.</p>
<p>Updates from inside the app work for the Windows installer, the macOS app and the Linux AppImage. A
<code>.deb</code> or <code>.rpm</code> install updates by installing the new file. Versions before 0.2.1 update
the same way once.</p>

<h2>Android</h2>
<p>The phone app is not in any store yet. If a release has an Android <code>.apk</code>, you can install it from
there. See <a href="phone.html">Android app</a>.</p>

<h2>Next</h2>
<p>Open HPC Hub and follow <a href="first-sign-in.html">First sign-in</a>.</p>
""")


add("first-sign-in", "first-sign-in.html", "First sign-in", "First sign-in",
    "Choose your clusters, set up your login, and choose the resources to ask for when you connect.",
    """
<h2>Choose your clusters</h2>
<p>On <strong>Welcome to HPC Hub</strong>, select each cluster where you have an account, then
<strong>Continue</strong>. You can show or hide them later in <strong>Settings</strong>, under
<strong>Clusters</strong>.</p>

<h2>Set up your login</h2>
<h3>Wulver at NJIT</h3>
<p>Enter your UCID and password. If you type an NJIT email such as <code>ab123@njit.edu</code>, HPC Hub uses
<code>ab123</code>.</p>
<h3>Bouchet at Yale</h3>
<p>Enter your NetID. Yale uses an SSH key instead of a password:</p>
<ol>
<li>Select <strong>Create key</strong>, or <strong>Use a key I already have</strong>.</li>
<li>Select <strong>Copy</strong>, then <strong>Open key page</strong>. Paste the key on Yale's page, then select
<strong>I pasted it</strong>.</li>
<li>Test the key. Yale can take up to 10 minutes to accept a new one.</li>
</ol>
<p>Yale's key page only loads on campus or on the VPN. <strong>Connect VPN only</strong> in the cluster card's
<strong>&#8942;</strong> menu gets you there from elsewhere. Yale's VPN has its own Microsoft sign-in, set under
<strong>Server and VPN</strong> in the cluster's settings.</p>
<h3>Expanse at SDSC</h3>
<p>Use your ACCESS username. <strong>Sign in with the portal</strong> sets up access without storing a password.
You can also use your ACCESS password. Expanse asks for a code from your authenticator app when you connect;
<strong>Set up your authenticator app</strong> shows how.</p>

<h3>The login check</h3>
<p>When you select <strong>Continue</strong> with a password, HPC Hub checks it with the cluster before going on.
This does not send a Duo push. If the password is wrong, the step says so and you can type it again.</p>
<p>If the cluster can't be reached from your network yet, for example before the VPN is up, the step says so and
lets you go on. Your login is then checked when you connect.</p>
<p><strong>Remember password</strong> keeps the password in your computer's keyring. Turn it off to type it each
time you open HPC Hub. <strong>Do this later</strong> skips the step until you connect.</p>

<h2>Choose your compute resources</h2>
<ul>
<li><strong>Get a compute node when I connect</strong>: on, HPC Hub asks for a node each time you connect. Off,
you get one later from the cluster card.</li>
<li>The size: <strong>Light CPU</strong>, <strong>Heavy CPU</strong> or <strong>GPU</strong>, then
<strong>Cores</strong>, <strong>Memory</strong> and <strong>Time</strong>.</li>
<li><strong>Ask before each request</strong>: shows these choices each time, so you can change them.</li>
</ul>
<p>See <a href="compute-nodes.html">Compute nodes and queues</a> for queues, priorities and cost. Select
<strong>Continue</strong>, or <strong>Done</strong> for the last cluster.</p>

<h2>Connect</h2>
<ol>
<li>On <strong>Clusters</strong>, select <strong>Connect</strong> on the cluster card.</li>
<li>Complete any VPN setup or web sign-in that opens.</li>
<li>Approve Duo, or enter the code from your authenticator app, if the cluster asks.</li>
<li>If you asked for a compute node, wait for Slurm to give you one. The card shows each step.</li>
</ol>
<p>If the cluster refuses your password, a <strong>Wrong password</strong> window opens with the username it
tried. Type the password again and select <strong>Try again</strong>. HPC Hub stops after one try, so your account
isn't locked.</p>
<p>On a computer, only one university VPN can run at a time. HPC Hub asks before switching to another one.</p>

<h2>Change a saved login later</h2>
<p>Select the gear on the cluster card. <strong>Sign-in</strong> changes your login or forgets a saved password.
<strong>Compute node</strong> changes the resources to ask for. <strong>Advanced</strong> has <strong>Server and
VPN</strong>, <strong>VS Code job</strong> and <strong>Agents</strong>.</p>
<div class="note"><p>Your saved VPN password is only typed into your university's own sign-in pages or a known
sign-in provider, over https.</p></div>
""")


add("compute-nodes", "compute-nodes.html", "Compute nodes and queues", "Compute nodes and queues",
    "A compute node is a computer you use for a set time. HPC Hub asks Slurm for one with the size you choose and "
    "shows the time left.",
    """
<h2>Get a node</h2>
<p>With <strong>Get a compute node when I connect</strong> on, a node comes with every connect. Otherwise select
<strong>Get one</strong> on the cluster card, or <strong>Compute node</strong> in its <strong>&#8942;</strong>
menu. The window has:</p>
<ul>
<li><strong>Size</strong>: <strong>Light CPU</strong> (2 cores, 8 GB), <strong>Heavy CPU</strong> (8 cores,
32 GB) or <strong>GPU</strong>, as a starting point.</li>
<li><strong>Cores</strong>, <strong>Memory</strong> and <strong>Time</strong>, up to what the queue allows.</li>
<li><strong>Queue and priority</strong>: see <a href="#queues-and-priorities">below</a>.</li>
<li><strong>Cost</strong>: the SUs it costs, where the cluster bills.</li>
</ul>
<p>Select <strong>Get node</strong>. The node is a Slurm job, so it also shows on <a href="jobs.html">Jobs</a>.
It may wait in the queue before it starts.</p>

<h2>Queues and priorities</h2>
<p><strong>Queue and priority</strong> has three choices, read from Slurm after you connect:</p>
<ul>
<li><strong>Queue</strong>: which nodes and time limits the job uses. Queues of GPU nodes are listed with the
<strong>GPU</strong> size, not the CPU sizes. Queues only for other groups are hidden.</li>
<li><strong>Priority</strong>: how the job is billed and how soon it starts.</li>
<li><strong>Group to bill</strong>: the account the hours go to. Empty means your default group.</li>
</ul>
<p>HPC Hub keeps the choices consistent:</p>
<ul>
<li>A queue that takes only its own priority (a debug queue, for example) switches the priority to it and says
so.</li>
<li>A queue of GPU nodes adds a GPU to the request and switches the size to <strong>GPU</strong>.</li>
<li>A combination Slurm would never start can't be sent.</li>
</ul>
<p><strong>Learn about queues</strong>, at the top of the queue list, opens the
<a href="usage.html#limits">Limits</a> table.</p>
<h3>Whole-node queues</h3>
<p>On some queues you always get whole nodes. The queue's line says <strong>You always get whole nodes, even if you
ask for fewer cores</strong>, and the cost is counted per node. Pick such a queue when you can use the whole
machine. Some queues also say <strong>Other jobs can stop yours</strong>: save often there.</p>

<h2>Time left</h2>
<p>The card shows your node and its time left, for example <strong>On node n0123</strong> · job 123456 · 3 h
20 min left. About 15 minutes before the end, HPC Hub sends a notification. When the time is up, Slurm ends the
job, and everything on that node stops, including its terminals.</p>
<p><strong>started elsewhere</strong> means the node came from another job you already had (the <strong>Reuse a
node you already have</strong> setting).</p>

<h2>Give a node back</h2>
<p><strong>Release node</strong> in the card's <strong>&#8942;</strong> menu ends the job early. It asks first:
anything running on it stops, but you stay connected. <strong>Disconnect</strong> releases the node too. Quitting
the app does not; use <strong>Settings</strong>, <strong>Disconnect all and quit</strong> for that.</p>

<h2>The maintenance warning</h2>
<p>Slurm won't start a job that would still run when booked maintenance begins. If the time you ask for runs into
maintenance, the window says so before you send the request:</p>
<div class="warn"><p><strong>Maintenance starts Tue, Nov 10 at 7:50 AM EST.</strong> A 12 h job can't finish
before then, so it would wait until maintenance is over. Shortened, it can start now.</p></div>
<p>Choose <strong>Shorten to</strong> a time that ends before it, or <strong>Keep</strong> your time
<strong>and wait</strong>. Nothing changes unless you shorten it.</p>
""")


add("terminals", "terminals.html", "Terminals", "Terminals",
    "Each terminal is a tmux session on the cluster. Closing a tab or the app leaves it running; stopping the "
    "session or the end of its compute job stops it.",
    """
<h2>Open a terminal</h2>
<p>Select <strong>Terminal</strong> on a cluster card, or <strong>New terminal</strong> on the
<strong>Terminals</strong> page. Choose:</p>
<ul>
<li><strong>Name</strong>: anything. It starts as the time, like <em>Terminal 14:05</em>.</li>
<li><strong>Run on</strong>: <strong>Login node</strong>, or your compute node.</li>
<li><strong>Start in</strong>: the folder to start in. Empty means your home folder.</li>
</ul>
<p>Select <strong>Open terminal</strong>.</p>

<h2>Login node or compute node</h2>
<p>The login node is shared. Use it to edit files, move them and submit jobs. Run builds, installs and scripts on
your compute node, within the resources your job has. A terminal on a compute node stops when the node's time is
up, so check the time left on the card before a long install.</p>

<h2>Sessions keep running</h2>
<p>Closing a tab leaves the session running. The <strong>Sessions</strong> list on the Terminals page shows every
session on each connected cluster, including tmux and screen sessions you started yourself. Select one to open it
again. Its <strong>&#8942;</strong> menu has <strong>Rename</strong> and <strong>Stop session</strong>, which asks
first.</p>
<p>If the cluster says <strong>tmux is not installed here</strong>, sessions can't be kept there.</p>
<h3>Reconnecting</h3>
<p>When the connection drops, the tab says so and offers <strong>Reconnect</strong>. Once the cluster is back, the
tab attaches to the session again. <strong>This session has ended.</strong> means the session is gone, for
example because its compute node's time ran out.</p>

<h2>The timeline</h2>
<p>The map on the right edge of a terminal shows the whole session's output, with prompts, tables and your marks.
Scroll up or drag the map to read back in a copy over the terminal; the session keeps running underneath.</p>
<ul>
<li><strong>Back to live</strong>, <kbd>Esc</kbd> or typing returns to the terminal.</li>
<li>The arrows for <strong>Prompts</strong> step to the previous or next command you ran. Down past the last one
returns to live.</li>
</ul>
<h3>Marks</h3>
<p>A mark is a named place in the history. While reading, select the gutter left of a line, or press
<kbd>M</kbd>, and name it. <strong>Marks</strong> lists them, with <strong>Copy</strong>, <strong>Rename</strong>
and <strong>Remove</strong>. Marks are kept in your home folder on the cluster, so every device sees them, and a
mark keeps its text after the session ends.</p>

<h2>Settings</h2>
<p>In <strong>Settings</strong>, under <strong>Terminals</strong>: <strong>Select to copy</strong>, and the
<strong>Monitoring bar</strong> with CPU, memory and network under each terminal.</p>

<h2>Pasting scripts</h2>
<p>A script with <code>set -e</code> ends the terminal's shell when a command fails, if you paste it. Save it to
a file and run <code>bash setup.sh</code> instead. See
<a href="troubleshooting.html#a-pasted-script-closed-my-terminal">Troubleshooting</a>.</p>
""")


add("vscode", "vscode.html", "VS Code", "VS Code",
    "VS Code runs on a compute node as a job of its own and opens on your computer, in the VS Code app or the "
    "browser. Its window shows each step until VS Code is ready.",
    """
<h2>Start VS Code</h2>
<p>Select <strong>VS Code</strong> on a cluster card, or open a project with VS Code. If you have no VS Code job
on that cluster, the window asks for:</p>
<ul>
<li><strong>Folder</strong> to open, and <strong>Open in</strong>: the VS Code app or the browser.</li>
<li>The size of the job, as for a <a href="compute-nodes.html">compute node</a>.</li>
<li><strong>Use these next time</strong> and <strong>Ask every time</strong>. With <strong>Ask every time</strong>
off, VS Code starts with your saved choices and the window shows its steps.</li>
</ul>
<p>Select <strong>Start VS Code</strong>.</p>

<h2>The steps</h2>
<ol>
<li><strong>Job submitted.</strong></li>
<li><strong>Waiting for a compute node.</strong> The window says why it waits and when Slurm expects it to
start.</li>
<li><strong>Starting the VS Code tunnel.</strong></li>
<li><strong>Sign in to GitHub</strong>, the first time only. Select <strong>Copy</strong>, then <strong>Open
GitHub</strong>, paste the code there and authorize it. The window goes on by itself.</li>
<li><strong>Open in VS Code</strong>. The first time, VS Code installs its server on the node, which takes a
minute or two. Then the window says <strong>VS Code is running</strong>.</li>
</ol>
<p>You can close the window at any step with <strong>Keep going in the background</strong>. VS Code still opens
when it is ready, and the GitHub code shows as a note if it's needed.</p>

<h2>One VS Code job per cluster</h2>
<p>While a VS Code job is waiting or running, selecting VS Code shows that job instead of starting another one.
From there:</p>
<ul>
<li><strong>Open again</strong>, or open it in the other place (app or browser).</li>
<li><strong>Show log</strong> shows the job's whole output in a terminal tab.</li>
<li><strong>Stop job</strong> asks first, then ends it.</li>
</ul>
<p>After the job ends, the window says why and offers <strong>Start a new one</strong>.</p>

<h2>When a job can't start</h2>
<p>If Slurm keeps the job waiting for a reason that never clears, for example a priority its queue doesn't take,
the window says so and offers <strong>Stop and change</strong>. It stops the job and opens the form again so you
can pick another queue or priority.</p>

<h2>The VS Code app or the browser</h2>
<p>The VS Code app needs to be installed on your computer. The first time, it adds Remote Tunnels and asks you to
sign in with GitHub. Without the app, HPC Hub opens VS Code in the browser at vscode.dev.</p>
<div class="note"><p>VS Code keeps its GitHub sign-in in your home folder on the cluster, unencrypted, so a tunnel
on a new node doesn't ask again. Run <code>code tunnel user logout</code> on the cluster to remove it.</p></div>
""")


add("jobs", "jobs.html", "Jobs", "Jobs",
    "Open Jobs, pick a cluster, and select a job to see its state, its output files and why it waits.",
    """
<h2>See your jobs</h2>
<p>Pick the cluster at the top, then under <strong>Which jobs</strong>:</p>
<ul>
<li><strong>My jobs</strong>: running and waiting now.</li>
<li><strong>My group</strong>: everyone in your groups.</li>
<li><strong>My history (7 days)</strong>: your jobs from the last week, finished ones too.</li>
<li><strong>All jobs</strong>: everyone's jobs on the cluster.</li>
</ul>
<p><strong>State</strong> filters by running, waiting, finished and so on. The search box finds a job by id,
name, person or queue, for example <code>jdoe</code>.</p>
<p>Select a job for its details: time used, folders and output files (each with <strong>Copy path</strong>), and
<strong>All fields</strong> for everything Slurm knows.</p>

<h2>Submit a job</h2>
<p>Open your Slurm script in <strong>Code</strong> (from Files, a project or a job's folder). The bar above a
Slurm script has <strong>Submit job</strong>. The new job shows up here.</p>

<h2>Why a job waits</h2>
<p>The reason is written out in plain words, for example:</p>
<ul>
<li><strong>Waiting: higher-priority jobs go first</strong></li>
<li><strong>Waiting: not enough free nodes yet</strong></li>
<li><strong>Waiting: maintenance has to finish first</strong></li>
<li><strong>Waiting: your group is out of SUs</strong></li>
<li><strong>Won't start: longer than this queue allows</strong></li>
</ul>

<h2>Cancel a job</h2>
<p>The <strong>&#8942;</strong> on a row has <strong>Cancel job</strong>, which asks first. To cancel several, tick
them and use the bar that appears. Cancelling a job stops everything running in it. For the node HPC Hub got for
you, this is <strong>Release node</strong>, and your terminals on that node stop too.</p>

<h2>Notifications</h2>
<p>While a cluster is connected, HPC Hub checks your jobs about once a minute and tells you when one ends.
Selecting the notification opens Jobs.</p>
""")


add("files", "files.html", "Files and transfers", "Files and transfers",
    "Browse your folders on each cluster, preview and edit files, upload and download, and copy between clusters.",
    """
<h2>Browse</h2>
<p>The <strong>Browse</strong> tab of <strong>Files</strong> shows one cluster at a time: your places on the left,
the path at the top. Select a file to preview it; PDFs, images and text show next to the list. The PDF viewer can
search, zoom, look words up and read aloud.</p>
<p>Right-click a file or folder for <strong>Open</strong>, <strong>Edit in Code</strong>,
<strong>Download</strong>, <strong>Rename</strong>, <strong>Copy path</strong>, <strong>Make a zip</strong> or
<strong>Extract here</strong>, and <strong>Delete</strong>. Delete asks first and is permanent: there is no
trash.</p>

<h2>Upload and download</h2>
<p>Right-click empty space for <strong>Upload files here</strong> and <strong>New folder</strong>. Use
<strong>Download</strong> on a file or folder to save it on your computer.</p>

<h2>Copy between clusters</h2>
<ol>
<li>Choose <strong>Copy, then paste on any cluster</strong> on a file or folder.</li>
<li>Go to the other cluster's folder and choose <strong>Paste here</strong>.</li>
<li>Pick <strong>How</strong>:
<ul>
<li><strong>Through this laptop</strong>: keep HPC Hub open and the computer awake until it's done.</li>
<li><strong>Globus</strong>: cluster to cluster. It keeps going after HPC Hub closes.</li>
</ul></li>
</ol>
<p>Both clusters have to be connected. On a computer only one university VPN runs at a time, so two clusters that
both need a VPN can't be connected together; use Globus between them.</p>

<h2>Follow a transfer</h2>
<p>The <strong>Transfers</strong> tab lists copies through this laptop and Globus transfers, with progress,
<strong>Cancel transfer</strong> and <strong>Open in Globus</strong>.</p>

<h2>Set up Globus</h2>
<p>Globus needs a one-time setup:</p>
<ol>
<li><strong>Make a free Globus app id.</strong> At app.globus.org, go to Settings, Developers, and register an
app for native applications distributed to users. Name it HPC Hub and add the redirect
<code>https://auth.globus.org/v2/web/auth-code</code>. Paste its Client ID under <strong>Set up Globus</strong> and
select <strong>Save</strong>.</li>
<li><strong>Sign in to Globus</strong> with your university login, in your browser. If Globus shows a code, paste
it into the app.</li>
<li>HPC Hub finds each cluster's Globus collection. If it can't, pick it from the list.</li>
<li>When a collection needs your consent, select <strong>Allow</strong>.</li>
</ol>
<p>On some clusters the collection only works while Globus Connect runs there. HPC Hub says so and offers to start
it on the login node.</p>
""")


add("projects", "projects.html", "Projects", "Projects",
    "A project is a saved name for a folder on a cluster. Open it in your tools in one click, or copy it to "
    "another cluster.",
    """
<h2>Make or add a project</h2>
<p>On the <strong>Projects</strong> page:</p>
<ul>
<li><strong>New project</strong> makes a folder: a <strong>Name</strong> (like <code>thesis</code>), the
<strong>Cluster</strong>, what to <strong>Start with</strong> (Empty, LaTeX paper or Python), and whether to
<strong>Make it a git repository</strong>.</li>
<li><strong>Add folder</strong> turns a folder you already have into a project.</li>
</ul>
<p>The <strong>&#8942;</strong> menu has <strong>Edit</strong>, <strong>Copy path</strong> and <strong>Remove from
the list</strong>. Removing keeps the folder on the cluster.</p>
<div class="note"><p>Scratch gets cleaned up. Keep work you need in your project space. See
<a href="backup.html">Back up scratch</a>.</p></div>

<h2>Open a project</h2>
<p><strong>Open</strong> connects if needed and offers <strong>Code</strong>, <strong>Files</strong>,
<strong>Terminal</strong>, <a href="vscode.html">VS Code</a>, and the <a href="agents.html">AI agents</a>. Each one
starts in the project's folder.</p>

<h2>Copy or sync to another cluster</h2>
<p><strong>Copy or sync</strong> on a project copies it when you select it. The source stays as it is.</p>
<ol>
<li><strong>Where</strong>: the cluster and folder. HPC Hub suggests your project space there.</li>
<li><strong>How</strong>: <strong>Globus</strong> for big projects (copying again only sends what changed), or
<strong>Through this laptop</strong> for small ones.</li>
<li><strong>What to take</strong>: untick large outputs you can make again.</li>
</ol>
<p>Select <strong>Copy</strong> or <strong>Sync</strong>. Both clusters must be connected. Progress shows under
<strong>Copies</strong>, where <strong>Stop copy</strong> stops it.</p>
<h3>Claude chats</h3>
<p>Tick the Claude chats to take along, and you can continue them on the other cluster.</p>
""")


add("backup", "backup.html", "Back up scratch", "Back up scratch",
    "Check which scratch files may be deleted, review a plan, and copy what you need to your project folder.",
    """
<h2>Why</h2>
<p>Most clusters delete old files in scratch. HPC Hub shows the rule for your cluster, from its docs, and uses the
number the cluster reports when it reports one. HPC Hub never touches files to make them look newer.</p>

<h2>Where to find it</h2>
<ul>
<li><strong>Agents</strong>, the <strong>Backup</strong> tab.</li>
<li><strong>Usage</strong>, <strong>Storage</strong>: <strong>See what is at risk</strong> on a scratch row.</li>
<li>A note and a notification when files are close to deletion, with <strong>See the plan</strong>.</li>
</ul>

<h2>The steps</h2>
<ol>
<li><strong>Check</strong>: <strong>Check my scratch</strong> looks at every file. The time depends on how many
files you have and how busy the cluster is; you can close the app meanwhile.</li>
<li><strong>At risk</strong>: how many files go soon, how big they are and where.</li>
<li><strong>Plan</strong>: each folder is <strong>Keep</strong> or <strong>Leave out</strong>; change any of
them.</li>
<li><strong>Space</strong>: how much of your project folder the copy uses. <strong>Try it first</strong> checks
without copying.</li>
<li><strong>Copy</strong>: runs on the cluster, so you can close the app. <strong>Stop copy</strong> keeps what was
copied; starting again goes on from there.</li>
</ol>
<p>At the end, the copy is compared with scratch: by checksum for smaller backups, and by size and time for larger
ones. Nothing in scratch is changed or deleted. A newer file replacing an older one in project keeps the old one in
<code>.hpc-hub-replaced</code>.</p>

<h2>Weekly check</h2>
<p><strong>Reminders</strong> can <strong>Check scratch every week</strong> at a time you choose. It runs on the
cluster and tells you what is at risk. It doesn't copy anything by itself.</p>
""")


add("usage", "usage.html", "Usage and SUs", "Usage and SUs",
    "Your group's SUs, who used them, your storage, how busy the queues are, and what each queue allows.",
    """
<h2>What an SU is</h2>
<p>An SU (service unit) is the unit your cluster charges for work. Rates depend on the cluster, the queue and the
resources. Your group (your lab's allocation) has a number of SUs, and jobs billed to it use them.</p>

<h2>The tabs</h2>
<p>Pick the cluster at the top, then a tab.</p>
<h3>Overview</h3>
<p>One card per group: <strong>SUs left</strong>, a bar of what is used with your part in it, and an estimate of
how long the SUs last at the pace of past use. A red tag says <strong>Near the limit</strong> or <strong>Used
up</strong>. Select a card to see who used it.</p>
<h3>Hours</h3>
<p>For a group and a period: the hours used and <strong>Who used it</strong>. Select a person to see their jobs.</p>
<h3>Storage</h3>
<p>Your quotas and how full each one is. Scratch rows say when files are deleted, with <strong>See what is at
risk</strong> (<a href="backup.html">Back up scratch</a>).</p>
<h3>Queues</h3>
<p>How busy each queue is now: busy CPUs, running jobs and waiting jobs. This doesn't promise a start time.</p>

<h2>Limits</h2>
<p>The most one job can ask for on each queue you can use, read from Slurm. <strong>Learn about queues</strong> in
the node window opens this too.</p>
<div class="table-wrap"><table>
<tr><th>Column</th><th>What it says</th></tr>
<tr><td>Queue</td><td>The name, whether it is the default, its nodes, and <em>whole nodes only</em> or <em>other jobs
can stop yours</em> where they apply.</td></tr>
<tr><td>Longest time</td><td>The longest a job may run, and the time you get if you don't ask.</td></tr>
<tr><td>Nodes, Cores</td><td>The most one job may use.</td></tr>
<tr><td>Memory per node</td><td>The memory limit, and memory per core where the queue sets one.</td></tr>
<tr><td>GPUs per node</td><td>How many and which kind, on clusters with GPUs.</td></tr>
<tr><td>Cost an hour</td><td>In SUs per core, GPU or node, or <em>Free</em>.</td></tr>
</table></div>
<p><strong>Priorities</strong>, under the table, lists each priority's longest time and caps. A job's priority can
set a shorter time or a lower cap than its queue.</p>

<h2>When numbers are missing</h2>
<p>Clusters keep different records. Where a cluster doesn't say, HPC Hub says so instead of guessing.</p>
""")


add("agents", "agents.html", "AI agents", "AI agents",
    "Run Claude, ChatGPT (Codex), Antigravity or Cursor on a compute node, next to your code and data.",
    """
<h2>Before you start</h2>
<p>The agent's own program has to be installed in your account on the cluster, and you need an account with that
agent's company. <strong>Ask all</strong> shows <strong>Not installed</strong> next to an agent it can't find.</p>

<h2>Start an agent</h2>
<p>Open <strong>Agents</strong> on a cluster card, or <strong>Open</strong> on a project, and pick one. The window
has:</p>
<ul>
<li><strong>Task (optional)</strong>: a first thing to work on.</li>
<li><strong>Folder</strong>: where it works.</li>
<li><strong>Use a new compute node</strong>: off, it shares your node; on, it gets its own.</li>
<li>The agent's options, such as <strong>Model</strong> or <strong>Permission mode</strong>.</li>
</ul>
<p>Select <strong>Start</strong>. The agent opens in a terminal tab and keeps running after you close the app,
until you stop it or its node's time runs out. <strong>Or continue a chat</strong> in the same window picks up an
earlier chat.</p>

<h2>Reopen an agent</h2>
<p>The <strong>Running</strong> tab of <strong>Agents</strong> lists every agent running on your clusters. Select
one to open it again.</p>

<h2>Permissions</h2>
<p>The <strong>Permissions</strong> tab sets what <strong>Claude</strong> may do on a cluster without asking you.
It is saved in Claude's settings on that cluster:</p>
<ul>
<li><strong>Edit files without asking</strong>.</li>
<li><strong>Move deleted files to the trash</strong>, kept for 7 days.</li>
<li><strong>Ask first</strong>: cancelling jobs, force pushing and throwing away changes always ask.</li>
<li><strong>Run without asking</strong>: groups of commands, and <strong>Add a command</strong> for your own.</li>
</ul>
<p>The other agents follow their own permission settings, chosen in their window.</p>
<h3>Passcode lock</h3>
<p>The <strong>Passcode lock</strong> on the same tab makes Claude on a cluster take no messages until you start
one with the current code from your authenticator app, like <code>123456 fix the tests</code>.</p>

<h2>Remote control</h2>
<p>Some agents can be used from another device while they run on the cluster: <strong>Remote control</strong> for
Claude (claude.ai/code or the Claude app) and Antigravity, and <strong>ChatGPT remote</strong> for ChatGPT (a
pairing code shows in the terminal).</p>

<h2>Ask all</h2>
<p><strong>Ask all agents</strong>, in a project's <strong>Open</strong> window, puts one question to several agents.
Choose <strong>Who answers</strong>, and <strong>Let them read each other's answers</strong> for a second
round.</p>
""")


add("phone", "phone.html", "Android app", "Android app",
    "The Android app has the same pages as the desktop, made for a phone. It is not in any store yet.",
    """
<div class="note"><p>See <a href="install.html#android">Install and update</a> for how to get it.</p></div>

<h2>Sign in by scanning</h2>
<ol>
<li>On your computer, open <strong>Settings</strong> in HPC Hub and choose <strong>Set up the phone app</strong>
(or <strong>Connect phone</strong> in a cluster card's <strong>&#8942;</strong> menu).</li>
<li>Pick the logins to send. With <strong>Include passwords</strong> off, the phone asks for each password.</li>
<li>Select <strong>Show QR code</strong> and scan it with the phone.</li>
</ol>
<p>The code carries the logins you chose. The phone then connects on its own; Duo asks on the phone where the
cluster uses it. For clusters that use SSH keys, the phone gets a key of its own.</p>

<h2>Stay connected in the background</h2>
<p>Android can close connections to save battery. In <strong>Settings</strong>, <strong>On the phone</strong>,
turn on <strong>Stay connected in the background</strong> and <strong>Run without battery limits</strong>.</p>

<h2>Notifications</h2>
<p>Choose which ones in <strong>Settings</strong>, <strong>Notifications</strong>: Duo waiting, a cluster
connected, node time almost up, a job ended, a copy finished, scratch files close to deletion, and more.</p>

<h2>Terminals on the phone</h2>
<ul>
<li>Swipe to scroll; tap to open the keyboard.</li>
<li>The key row has <strong>Esc</strong>, <strong>Tab</strong>, <strong>Ctrl</strong>, <strong>Alt</strong> and the
arrows.</li>
<li>The timeline and marks work as on the desktop.</li>
</ul>

<h2>VPN and passwords</h2>
<p>The phone uses the university VPN only for HPC Hub's own connections, and several clusters can be connected at
once. Logins are kept in an encrypted file whose key stays in the phone's Keystore.</p>
""")


add("experimental", "experimental.html", "Experimental features", "Experimental features",
    "Parts of HPC Hub that are still taking shape. They are off by default.",
    """
<div class="exp"><p>Turn them on in <strong>Settings</strong>, under <strong>Experimental</strong>. They may change or
break.</p></div>

<h2>Papers (LaTeX)</h2>
<p>An editor for LaTeX papers in a project on the cluster, built there with latexmk, with git and a history of
changes. Turn on <strong>Papers</strong>, then open a project made as a <strong>LaTeX paper</strong>.</p>

<h2>Skills</h2>
<p>A skill is a set of instructions for an agent. The <strong>Skills</strong> tab of <strong>Agents</strong> adds
them to the agents on each cluster, from HPC Hub's own set or a git repository.</p>

<h2>Scheduled agents</h2>
<p>An agent runs a task at set times, for example every night at 02:00. Each run is a Slurm job, so it runs with
your laptop off and uses your allocation like any other job.</p>
""", experimental=True)


add("troubleshooting", "troubleshooting.html", "Troubleshooting", "Troubleshooting",
    "What to do when a cluster won't connect, a password is refused, VS Code doesn't open, or a terminal closes.",
    """
<h2>Can't reach the VPN or the cluster on some networks</h2>
<p>The card says something like <strong>Can't reach Wulver from this network. Is the VPN on?</strong> Some
networks block VPN or SSH connections, such as guest Wi-Fi, hotels or conference networks. Try another network or
your phone's hotspot, then <strong>Try again</strong>.</p>

<h2>The cluster refuses my password</h2>
<p>A <strong>Wrong password</strong> window opens with the username it tried. Check the username, type the
password again and select <strong>Try again</strong>. On Expanse, also check the code from your authenticator
app.</p>

<h2>Duo timed out</h2>
<p>Duo pushes expire after about a minute. Make sure the Duo app on your phone can receive notifications, then
select <strong>Try again</strong> or <strong>Send a new push</strong>.</p>

<h2>VS Code doesn't open</h2>
<ul>
<li>The VS Code window shows where it is. If it waits for a node, the reason is there; see
<a href="#waiting-a-long-time-for-a-node">below</a>.</li>
<li>The first time, sign in to GitHub with the code the window shows.</li>
<li>The first open installs VS Code's server on the node. That takes a minute or two.</li>
<li><strong>Show log</strong> shows everything the job printed. If the job can't start,
<strong>Stop and change</strong> lets you pick another queue or priority.</li>
</ul>
<p>More on the <a href="vscode.html">VS Code</a> page.</p>

<h2>Waiting a long time for a node</h2>
<p>A smaller node, a shorter time or another queue often starts sooner. <strong>Usage</strong>,
<strong>Queues</strong> shows how busy each queue is. Also check for the
<a href="compute-nodes.html#the-maintenance-warning">maintenance warning</a>.</p>

<h2>A pasted script closed my terminal</h2>
<p>The script most likely has <code>set -e</code>. Pasted into a terminal, it ends the terminal's own shell when a
command fails. Save it to a file and run it with bash, in a new terminal:</p>
<pre><code>nano setup.sh      # paste the script, save
bash setup.sh</code></pre>

<h2>Yale hasn't picked up my key</h2>
<p>It can take up to 10 minutes. Wait and select <strong>Try again</strong>. Yale's key page only loads on campus
or on the VPN; use <strong>Connect VPN only</strong> from the card's <strong>&#8942;</strong> menu.</p>

<h2>"The server looks different from last time"</h2>
<p>The cluster's server identity changed since you last connected. Check with the cluster's HPC team before you
connect.</p>

<h2>The VPN won't start on Windows or macOS</h2>
<p>The first VPN connect asks for permission once, for the VPN helper. If you declined, connect again and approve
it.</p>

<h2>The phone drops the connection in the background</h2>
<p>Turn on both settings in <strong>Settings</strong>, <strong>On the phone</strong>, and allow HPC Hub in the
phone's own battery settings. Terminal sessions keep running on the cluster either way.</p>

<h2>Globus copies don't start</h2>
<p>Check the one-time <a href="files.html#set-up-globus">Globus setup</a>, let HPC Hub start Globus Connect when it
asks, and select <strong>Allow</strong> when Globus needs your consent.</p>

<h2>Still stuck?</h2>
<p><a href="report-a-problem.html">Report a problem</a> from the app.</p>
""")


add("report", "report-a-problem.html", "Report a problem", "Report a problem",
    "HPC Hub can send a problem report for you. You read it before it goes.",
    """
<h2>Where to find it</h2>
<ul>
<li><strong>Settings</strong>, then <strong>Report a problem</strong>.</li>
<li><strong>Report</strong> next to an error, on a cluster card, an error message or a page that couldn't load.
The report then starts with that error.</li>
</ul>

<h2>Send a report</h2>
<ol>
<li>Write what you did, what you expected and what happened under <strong>What went wrong?</strong></li>
<li>Add your email if you'd like an answer. It is optional and sent as you type it.</li>
<li>Tick <strong>Add a screenshot of the window</strong> if it helps. Look at it first: its contents are not
changed.</li>
<li>Read <strong>Everything that will be sent</strong>, then select <strong>Send report</strong>.</li>
</ol>
<p>The window then says <strong>Report sent</strong> with a number to use if you write about it later.</p>

<h2>What is sent</h2>
<p>Nothing is sent until you select Send. The report holds the app's version, your system, the page, the error,
your note, your email if given, and the app's recent log. HPC Hub replaces known sensitive text, such as names,
folders, tokens and keys, with placeholders like <code>&lt;user&gt;</code> and <code>&lt;hidden&gt;</code>. Review
the report before sending.</p>

<h2>Other ways</h2>
<p>You can also open an issue on <a href="https://github.com/bavanDA/hpc-hub/issues">GitHub</a>. Issues are public,
so leave out usernames, group names and paths.</p>
""")


add("faq", "faq.html", "FAQ", "Questions and answers",
    "Privacy, cost, and what keeps running when you close the app.",
    """
<h2>Where are my passwords kept?</h2>
<p>In your system's keyring: GNOME Keyring on Linux, the Keychain on macOS, Credential Manager on Windows, and an
encrypted file with its key in the Keystore on Android. Never in plain text or in the app's settings files.</p>

<h2>What does HPC Hub connect to?</h2>
<p>Your clusters, their VPN and sign-in pages, GitHub to check for updates, and services you choose to use, such
as Globus, an AI agent's company, or the PDF viewer's dictionary and read aloud. There is no tracking and no HPC
Hub account. A <a href="report-a-problem.html">problem report</a> is only sent when you select Send.</p>

<h2>Does HPC Hub cost SUs?</h2>
<p>The app doesn't. Your compute node, VS Code and agents are Slurm jobs, billed like any other job by the queue
and priority you pick. The node window shows the cost first.</p>

<h2>What keeps running when I close the app?</h2>
<ul>
<li><strong>Closing the app</strong>: terminals, agents, VS Code and your compute node keep running until you stop
them or their time runs out. Globus transfers and backup copies go on. Copies through this laptop stop.</li>
<li><strong>Disconnecting</strong>: releases the node HPC Hub got for you. VS Code jobs and jobs you submitted keep
running.</li>
<li><strong>Stopping a job</strong>: ends everything in it.</li>
</ul>

<h2>Can I use a cluster that isn't listed?</h2>
<p>HPC Hub has Wulver, Bouchet and Expanse built in. A new cluster is added to HPC Hub itself: one file in
<code>hpc_hub/clusters/</code> describes it. See
<a href="https://github.com/bavanDA/hpc-hub/blob/main/CONTRIBUTING.md">CONTRIBUTING.md</a> for the steps and the
pull request.</p>

<h2>Can I use the phone and the computer at the same time?</h2>
<p>Yes. Both see the same sessions and marks. Duo asks on each device when it connects.</p>

<h2>Why does my system warn me when I open the app?</h2>
<p>The installers are not signed yet. See <a href="install.html">Install and update</a>.</p>

<h2>Is it open source?</h2>
<p>Yes, under the MIT license, on <a href="https://github.com/bavanDA/hpc-hub">GitHub</a>.</p>
""")
