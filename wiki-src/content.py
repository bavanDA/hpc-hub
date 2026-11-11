"""The wiki's text, one entry per page. Plain HTML fragments; build.py adds ids to h2 and h3."""

GROUPS = [
    ("Start", ["home", "install", "first-sign-in"]),
    ("Work on a cluster", ["compute-nodes", "terminals", "agents", "jobs", "usage"]),
    ("Your data", ["files", "projects", "backup"]),
    ("More", ["phone", "experimental", "troubleshooting", "report", "faq"]),
]

PAGES: dict[str, dict] = {}


def add(slug, file, nav, title, lead, body, experimental=False):
    PAGES[slug] = {"file": file, "nav": nav, "title": title, "lead": lead, "body": body,
                   "experimental": experimental}


add("home", "index.html", "Home", "HPC Hub",
    "One app for the computing clusters you use for research. Sign in once, get a compute node, and keep your "
    "terminals, jobs, files and AI agents in one window, on your computer or your Android phone.",
    """
<h2>What it is</h2>
<p>A cluster (or HPC system, for high performance computing) is a large group of computers that a university
shares among its researchers. Using one usually means a VPN, an SSH client, a Duo approval, a few Slurm commands
to get a machine to work on, and a separate tool to move files. HPC Hub puts all of that behind one
<strong>Connect</strong> button.</p>
<p>Once you are connected you can open a terminal, start VS Code or an AI coding agent on your own compute node,
look at your jobs and your group's hours, browse and copy files, and back up scratch before the cluster deletes
it. Terminals and agents keep running on the cluster when you close the laptop.</p>
<p>HPC Hub runs on Linux, Windows and macOS. There is also an Android app that does the same things on a
phone.</p>

<h2>Clusters it knows</h2>
<p>HPC Hub comes set up for three clusters:</p>
<ul>
<li><strong>Wulver</strong> at NJIT</li>
<li><strong>Bouchet</strong> at Yale</li>
<li><strong>Expanse</strong> at SDSC</li>
</ul>
<p>On the first start you pick the ones you use. You can change that later in <strong>Settings</strong>.</p>

<h2>New to HPC? A few words first</h2>
<p>These words come up all over the app and this wiki.</p>
<dl class="terms">
<dt>Login node</dt>
<dd>The shared computer you land on when you sign in. Fine for editing files and submitting jobs. Heavy work
does not belong here, since everyone on the cluster shares it.</dd>
<dt>Compute node</dt>
<dd>One computer in the cluster that runs your work. You borrow it for a set time, with the cores and memory you
asked for. HPC Hub can get one for you every time you connect.</dd>
<dt>Job</dt>
<dd>One request for cluster time. Your compute node, VS Code and agents each run as a job.</dd>
<dt>Slurm</dt>
<dd>The program most clusters use to hand out compute nodes and run jobs. HPC Hub talks to it for you.</dd>
<dt>Queue</dt>
<dd>Which group of nodes and time limits your job uses. Slurm calls it a partition.</dd>
<dt>Priority</dt>
<dd>How your job is billed and how soon it starts. Slurm calls it QoS.</dd>
<dt>Group</dt>
<dd>The account your hours are billed to, usually your lab or your advisor's allocation.</dd>
<dt>SU</dt>
<dd>Service units, the cluster's currency. 1 SU is roughly 1 core for 1 hour.</dd>
<dt>Scratch</dt>
<dd>Fast storage for working files. Most clusters delete old files there after a set number of days.</dd>
<dt>Session</dt>
<dd>A terminal or agent that keeps running on the cluster, even when the app is closed.</dd>
</dl>

<h2>Where to start</h2>
<div class="cards">
<a class="card" href="install.html"><b>Install</b><span>Get the app for Linux, Windows, macOS or Android.</span></a>
<a class="card" href="first-sign-in.html"><b>First sign-in</b><span>Pick your clusters, sign in once, VPN and Duo.</span></a>
<a class="card" href="compute-nodes.html"><b>Compute nodes</b><span>Get a node, pick a queue, see the time left.</span></a>
<a class="card" href="terminals.html"><b>Terminals</b><span>Sessions that survive disconnects, and the timeline.</span></a>
<a class="card" href="agents.html"><b>AI agents</b><span>Claude, ChatGPT, Antigravity and Cursor on a node.</span></a>
<a class="card" href="troubleshooting.html"><b>Troubleshooting</b><span>When something doesn't connect or stops.</span></a>
</div>

<h2>The pages in the app</h2>
<p>The sidebar on the left of the app (the menu at the top left on a phone) has these pages:</p>
<div class="table-wrap"><table>
<tr><th>Page</th><th>What it is for</th></tr>
<tr><td><strong>Clusters</strong></td><td>Connect, get a compute node, open a terminal, VS Code, Files or an agent.</td></tr>
<tr><td><strong>Projects</strong></td><td>Named folders on your clusters, opened in one click, copied between clusters.</td></tr>
<tr><td><strong>Terminals</strong></td><td>Terminal sessions in tmux, with the timeline and marks.</td></tr>
<tr><td><strong>Code</strong></td><td>A light editor for files on the cluster. Text files you open from Files land here.</td></tr>
<tr><td><strong>Agents</strong></td><td>Running agents, Backup of scratch, and what agents may run without asking.</td></tr>
<tr><td><strong>Papers</strong></td><td>LaTeX papers. <a href="experimental.html">Experimental</a>, hidden until you turn it on.</td></tr>
<tr><td><strong>Jobs</strong></td><td>Your jobs, your group's jobs and your history, with details and cancel.</td></tr>
<tr><td><strong>Usage</strong></td><td>SUs left, storage, how busy the queues are, and queue limits.</td></tr>
<tr><td><strong>Files</strong></td><td>Browse, preview, edit, upload and download, and copy between clusters, also with Globus.</td></tr>
</table></div>
<p><strong>Settings</strong> is at the bottom of the sidebar.</p>
""")


add("install", "install.html", "Install", "Install",
    "HPC Hub is downloaded from its releases page on GitHub. Pick the file for your system, then follow the "
    "steps for it.",
    """
<p>All downloads are on the <a href="https://github.com/bavanDA/hpc-hub/releases">releases page</a> of the
public <code>bavanDA/hpc-hub</code> repository on GitHub. Each release lists its files under
<strong>Assets</strong>.</p>
<div class="note"><p>The installers are not signed yet, so your system warns you the first time you open the app.
The steps below say how to get past that warning. It only happens once.</p></div>

<h2>Linux</h2>
<p>Pick one of these:</p>
<ul>
<li><strong>AppImage</strong>, for any distribution. Make it runnable, then start it:
<pre><code>chmod +x HPC-Hub_*.AppImage
./HPC-Hub_*.AppImage</code></pre></li>
<li><strong>Ubuntu and Debian</strong>: <code>sudo apt install ./HPC-Hub_*_linux_amd64.deb</code></li>
<li><strong>Fedora and RHEL</strong>: <code>sudo dnf install ./HPC-Hub_*_linux_x86_64.rpm</code></li>
</ul>
<h3>For the VPN</h3>
<p>Wulver and Yale need their university VPN. On Linux, HPC Hub uses <code>openconnect</code> for it, and
NetworkManager runs the tunnel. Install openconnect from your distribution if you don't have it.</p>
<p>A VPN that signs you in on the university's own web page (Yale's) also needs PyGObject with GTK 4 and
WebKitGTK 6:</p>
<ul>
<li>Ubuntu and Debian: <code>python3-gi gir1.2-webkit-6.0</code></li>
<li>Fedora: <code>python3-gobject webkitgtk6.0</code></li>
</ul>

<h2>Windows 10 and 11</h2>
<ol>
<li>Download the <code>-setup.exe</code> (or the <code>.msi</code>) and run it. If Windows says
<strong>Windows protected your PC</strong>, click <strong>More info</strong>, then <strong>Run anyway</strong>.</li>
<li>Open HPC Hub from the Start menu.</li>
<li>The first time you connect a cluster with a VPN (Wulver, Yale), HPC Hub asks to set up its VPN helper.
Click <strong>Set up</strong> and approve the Windows prompt. This happens once.</li>
</ol>

<h2>macOS</h2>
<p>The macOS build is for Macs with Apple silicon.</p>
<ol>
<li>Open the <code>.dmg</code> and drag HPC Hub to Applications.</li>
<li>Open it. macOS says it can't check the app. Go to <strong>System Settings</strong>, <strong>Privacy &amp;
Security</strong>, scroll down and click <strong>Open Anyway</strong>. This happens once.</li>
<li>The first time you connect a cluster with a VPN, approve <strong>Set up the VPN helper</strong> and type your
Mac password once.</li>
</ol>
<div class="note"><p>On Windows and macOS, all your DNS goes through the university while the VPN is up. On Windows,
<strong>Disconnect</strong> doesn't sign you out on the VPN server; that session ends by itself.</p></div>

<h2>Android</h2>
<p>The phone app is not on Google Play, F-Droid or any other store yet. Until it is, it is not one of the regular
downloads. If an Android file (<code>.apk</code>) is attached to a release, you can install it from there.
Otherwise the app can be built from the source code; the steps are in <code>docs/design/android.md</code> in the
repository.</p>
<p>Once it is on your phone, the easiest way to sign in is to scan a code from HPC Hub on your computer. See
<a href="phone.html">Phone app</a>.</p>

<h2>Next</h2>
<p>Open the app and follow <a href="first-sign-in.html">First sign-in</a>.</p>
""")


add("first-sign-in", "first-sign-in.html", "First sign-in", "First sign-in",
    "The first start asks which clusters you use, then walks you through signing in to each one and the size of "
    "the compute node you want. After that, connecting is one button.",
    """
<h2>Pick your clusters</h2>
<p>The first screen is <strong>Welcome to HPC Hub</strong>, with the question <strong>Which clusters do you
use?</strong> Click each cluster you have an account on, then <strong>Continue</strong>.</p>
<p>HPC Hub knows Wulver (NJIT), Bouchet (Yale) and Expanse (SDSC). To show or hide one later, open
<strong>Settings</strong> at the bottom of the sidebar and use the switches under <strong>Clusters</strong>. A
hidden cluster keeps its settings.</p>

<h2>Sign in to each cluster</h2>
<p>For each cluster you picked there are two short steps: the sign-in, then the compute node. The sign-in is
different on each cluster, because each university decides how its people log in. The app shows only what your
cluster needs.</p>
<h3>Wulver (NJIT)</h3>
<p>Type your UCID and password. When you connect, NJIT asks for a Duo push on your phone.</p>
<h3>Yale Bouchet</h3>
<p>Yale uses an SSH key instead of a password. HPC Hub walks you through it:</p>
<ol>
<li><strong>Make a key</strong>: click <strong>Create key</strong>, or <strong>Use a key I already have</strong>
and pick your private key file.</li>
<li><strong>Send it to Yale</strong>: click <strong>Copy</strong>, then <strong>Open key page</strong>, paste the
key there and click <strong>I pasted it</strong>. Yale's key page only loads on campus or on the VPN.</li>
<li><strong>Try it</strong>. If Yale hasn't picked up the key yet, the app says so. It can take up to 10
minutes.</li>
</ol>
<p>Yale's VPN has a login of its own, through Yale's Microsoft sign-in page. You can set it under
<strong>Server and VPN</strong> in Yale's settings (see <a href="#change-a-saved-login-later">below</a>).</p>
<h3>SDSC Expanse</h3>
<p>Expanse uses your ACCESS username. You have two ways in:</p>
<ul>
<li><strong>Sign in with the portal</strong>, which is the recommended way. No password is stored.</li>
<li>Your username and password, plus a code from your authenticator app at every sign-in. <strong>Set up your
authenticator app</strong> shows how to get one.</li>
</ul>
<h3>Remember password</h3>
<p>With <strong>Remember password</strong> on, the password is kept on this computer in the system keyring
(see <a href="faq.html#where-are-my-passwords-kept">where passwords are kept</a>). Turn it off and you'll type it
each time you open HPC Hub.</p>
<p>If you are not ready, <strong>Do this later</strong> skips the step. You'll be asked when you connect.</p>

<h2>Choose a compute node size</h2>
<p>The second step is <strong>Compute node on Wulver</strong> (or your cluster). Your terminals and agents run on
a compute node, not on the busy login node.</p>
<ul>
<li><strong>Get a compute node when I connect</strong>: on, and a node is ready as soon as you sign in. Off, and
you can still get one from the cluster card.</li>
<li>The size: <strong>Cores</strong>, <strong>Memory</strong>, <strong>Time</strong>, and <strong>Queue and
priority</strong>. The app checks these against what the cluster allows. See
<a href="compute-nodes.html">Compute nodes and queues</a>.</li>
<li><strong>Ask before each request</strong>: shows the node window each time you connect, so you can change the
size first.</li>
</ul>
<p>Press <strong>Continue</strong> (or <strong>Done</strong> on the last cluster) and you land on the
<strong>Clusters</strong> page.</p>

<h2>Connecting</h2>
<p>Each cluster has a card on the <strong>Clusters</strong> page. Press <strong>Connect</strong>. The card shows
each step as it happens, and a short log under it:</p>
<ol>
<li><strong>VPN</strong>, for clusters behind one (Wulver, Yale). On Windows and macOS, the first time, you are
asked to set up the VPN helper.</li>
<li><strong>Sign-in</strong> with your saved login. A sign-in page that needs you (a university web login) opens
in a window of the app.</li>
<li><strong>Duo</strong>, where the cluster uses it: <strong>Approve Duo on your phone</strong>, with a timer. If
nothing happens, the app says <strong>No answer from Duo yet. Pushes expire after about a minute.</strong> and
offers <strong>Send a new push</strong>.</li>
<li><strong>The compute node</strong>, if you asked for one: <strong>Waiting for a free node. Usually under a
minute, longer when the cluster is busy.</strong></li>
</ol>
<p>Once connected, the card shows your node and buttons for <strong>Terminal</strong>, <strong>VS Code</strong>,
<strong>Files</strong> and <strong>Agents</strong>. <strong>Stop signing in</strong> or <strong>Stop
waiting</strong> cancels at any point. If something fails, the card says what went wrong in a sentence and the
button turns into <strong>Try again</strong>.</p>

<h3>One VPN at a time</h3>
<p>On a computer, only one university VPN can run at a time. If you connect Yale while Wulver is up, HPC Hub
asks first: <strong>Only one VPN can run at a time. Wulver disconnects and its node is released.</strong> The
phone app doesn't have this limit.</p>
<h3>VPN only</h3>
<p>The <strong>&#8942;</strong> menu on a card has <strong>Connect VPN only</strong>, for when you need the
university network but not the cluster (for example, to open Yale's key page).</p>

<h2>Change a saved login later</h2>
<p>Click the gear on a cluster card (<strong>Wulver settings</strong>, for example). It has:</p>
<ul>
<li><strong>Sign-in</strong>: your username, and <strong>Forget password</strong> to remove the saved one. You'll
type it next time you connect.</li>
<li><strong>Authenticator app</strong>, on clusters that ask for a code.</li>
<li><strong>Compute node</strong>: the size to ask for, and whether to get one when you connect.</li>
<li>Under <strong>Advanced</strong>: <strong>Server and VPN</strong> (the login host, the VPN gateway, a separate
VPN login), <strong>VS Code job</strong> and <strong>Agents</strong>. Changes apply the next time you
connect.</li>
</ul>
<div class="note"><p>Your saved VPN password is only typed into the sign-in pages of your university's own site or
a known sign-in provider, over https.</p></div>
""")


add("compute-nodes", "compute-nodes.html", "Compute nodes and queues", "Compute nodes and queues",
    "A compute node is a machine you borrow for a set time. HPC Hub gets one for you, tells you what each queue "
    "allows and costs, warns you about maintenance, and counts down the time left.",
    """
<h2>Getting a node</h2>
<p>If you turned on <strong>Get a compute node when I connect</strong>, a node comes with every connect. If not,
the card says <strong>No compute node</strong> with a <strong>Get one</strong> link. Either way you can open
<strong>Compute node</strong> from the card's <strong>&#8942;</strong> menu.</p>
<p>The window <strong>Get a node on Wulver</strong> has:</p>
<ul>
<li><strong>Size</strong>: quick sizes to start from.</li>
<li><strong>Cores</strong>, <strong>Memory</strong> and <strong>Time</strong>. The most you can ask for comes from
the queue you picked.</li>
<li><strong>Queue and priority</strong>: see <a href="#queues-priorities-and-groups">below</a>.</li>
<li><strong>Cost</strong>: what the node costs in SUs, when the cluster bills for it.</li>
<li><strong>Use this size next time</strong> and <strong>Ask before each request</strong>.</li>
</ul>
<p>Press <strong>Get node</strong>. The node is a Slurm job like any other, so it shows on the
<a href="jobs.html">Jobs</a> page too.</p>

<h2>Time left</h2>
<p>When connected, the card shows your node and how long it has, for example
<strong>On node n0123</strong> · job 123456 · 3 h 20 min left. The time counts down while you watch.</p>
<p>About 15 minutes before the end, HPC Hub sends a notification: <strong>Save your work. The node ends when its
time is up.</strong> When the time is up, Slurm ends the job, and everything running on that node stops,
including terminals you opened there.</p>
<p>If the card says <strong>started elsewhere</strong>, the node came from another job you already had, for
example one an agent or VS Code got earlier (the <strong>Reuse a node you already have</strong> setting).</p>
<h3>Giving a node back</h3>
<p>When you are done early, open the card's <strong>&#8942;</strong> menu and choose <strong>Release
node</strong>. The app asks first: anything running on it stops, but you stay connected and your files stay
where they are. <strong>Disconnect</strong> releases the node too.</p>
<p>Quitting the app does not release your node; it keeps running until its time is up. To release everything as
you leave, use <strong>Settings</strong>, <strong>Disconnect all and quit</strong>.</p>

<h2>Queues, priorities and groups</h2>
<p><strong>Queue and priority</strong> opens three choices. The lists come from Slurm, so they show only what
your account can use:</p>
<ul>
<li><strong>Queue</strong>: which group of nodes and time limits the job uses. Each queue has a line saying what
one job can get there, for example <em>Up to 3 days · up to 128 cores · up to 500 GB memory</em>, and what is
easy to miss about it.</li>
<li><strong>Priority</strong>: how the job is billed and how soon it starts.</li>
<li><strong>Group to bill</strong>: the account the hours go to, for example <code>mygroup</code>. Empty means
your default group.</li>
</ul>
<p><strong>Learn about queues</strong>, at the top of the queue list, opens the full table of limits.</p>

<h3>What a whole-node queue means</h3>
<p>On some queues you always get whole nodes, even if you ask for fewer cores. The app says so in the queue's
line: <strong>You always get whole nodes, even if you ask for fewer cores</strong>. On those queues the cost is
counted per node, <em>however little of it you use</em>. Asking for 2 cores on a whole-node queue costs the same
as asking for all of them, so pick such a queue when you can use the whole machine.</p>
<p>Some queues also say <strong>Other jobs can stop yours</strong>. Work there can be stopped to make room for
other jobs, so save often or pick another queue for long runs.</p>

<h2>The Limits tab</h2>
<p><strong>Usage</strong>, <strong>Limits</strong> (also opened by <strong>Learn about queues</strong>) shows the
most one job can ask for on each queue you can use, read from Slurm just now. Nothing is typed in by hand, so
it matches what the cluster will accept.</p>
<div class="table-wrap"><table>
<tr><th>Column</th><th>What it says</th></tr>
<tr><td>Queue</td><td>The name, whether it is the default, how many nodes it has, <em>whole nodes only</em> and
<em>other jobs can stop yours</em> where they apply. A queue that is down says so.</td></tr>
<tr><td>Longest time</td><td>The longest a job may run, and the time you get if you don't ask.</td></tr>
<tr><td>Nodes</td><td>The most nodes one job may use.</td></tr>
<tr><td>Cores</td><td>The most cores one job may use, and how many each node has.</td></tr>
<tr><td>Memory per node</td><td>The memory limit, and the memory per core where the queue sets one.</td></tr>
<tr><td>GPUs per node</td><td>Shown when the cluster has GPUs: how many and of which kind.</td></tr>
<tr><td>Cost an hour</td><td>In SUs per core, per GPU or per node, or <em>Free</em>.</td></tr>
</table></div>
<p>If some queues need a group or priority you don't have, the note above the table says how many. Under it,
<strong>Priorities</strong> lists each priority with its longest time, its caps for <strong>One job</strong> and
for <strong>All your jobs together</strong>, and what it does to the SUs (<em>Free</em>, <em>Normal</em> or, for
example, <em>2x</em>). A job runs under one priority, which can set a shorter time or a lower cap than its
queue.</p>

<h2>The maintenance warning</h2>
<p>Clusters book maintenance ahead of time. Slurm won't start a job that would still be running when maintenance
begins, so a long job asked for the day before maintenance just waits.</p>
<p>When you ask for a node, HPC Hub reads the booked maintenance from Slurm. If the time you asked for runs into
it, the node window says so before you send the request, for example:</p>
<div class="warn"><p><strong>Maintenance starts Tue, Nov 10 at 7:50 AM EST.</strong> A 12 h job can't finish
before then, so it would wait until maintenance is over. Shortened, it can start now.</p></div>
<p>You choose:</p>
<ul>
<li><strong>Shorten to</strong> a time that ends before maintenance, with a few minutes to spare, or</li>
<li><strong>Keep</strong> your time <strong>and wait</strong>.</li>
</ul>
<p>Nothing changes unless you press Shorten. While maintenance is under way, the window says <strong>Maintenance
is under way. New jobs wait until it is over.</strong> Only maintenance of the whole cluster counts; a few nodes
taken out for repairs don't hold up your job.</p>
<p>On the <a href="jobs.html">Jobs</a> page, a job held back this way shows <strong>Waiting: maintenance has to
finish first</strong>.</p>
""")


add("terminals", "terminals.html", "Terminals", "Terminals",
    "Every terminal in HPC Hub is a tmux session on the cluster, so it keeps running when your laptop sleeps, "
    "the Wi-Fi drops or you close the app. The timeline lets you read back and mark what matters.",
    """
<h2>Open a terminal</h2>
<p>Press <strong>Terminal</strong> on a cluster card, or <strong>New terminal</strong> on the
<strong>Terminals</strong> page. The <strong>New terminal</strong> window asks:</p>
<ul>
<li><strong>Name</strong>: anything you like. It starts as the time, like <em>Terminal 14:05</em>.</li>
<li><strong>Cluster</strong>, when more than one is connected.</li>
<li><strong>Run on</strong>: <strong>Login node</strong> or <strong>Node n0123</strong>, your compute node.</li>
<li><strong>Start in</strong>: the folder to start in. Empty means your home folder.</li>
</ul>
<p>Press <strong>Open terminal</strong>.</p>

<h2>Login node or compute node?</h2>
<p>The login node is shared with everyone on the cluster. It is the right place for editing files, moving them
around and submitting jobs. Your compute node is yours alone, and it is the right place for builds, scripts and
heavy work.</p>
<h3>Long installs</h3>
<p>Installing a big package (a conda environment, a large pip install, compiling code) can take a long time and a
lot of CPU. Run it on your compute node: pick <strong>Node</strong> under <strong>Run on</strong>.</p>
<p>A terminal on the compute node lives as long as the node does. When the node's time is up, the terminal stops
with it. Before a long install, check the time left on the cluster card, and get a node with enough time if
needed. See <a href="compute-nodes.html#time-left">Time left</a>.</p>

<h2>Sessions keep running</h2>
<p>Each terminal runs inside tmux on the cluster. Closing a tab doesn't stop it; the app tells you
<strong>Terminal 14:05 is still running. Reopen it from Sessions.</strong></p>
<p>The <strong>Sessions</strong> list on the Terminals page shows every session on each connected cluster, also
ones you started yourself outside the app (tmux and screen). Click one to open it again. Its
<strong>&#8942;</strong> menu has <strong>Rename</strong> and <strong>Stop session</strong>; stopping asks first,
because everything running in it stops.</p>
<p>If the cluster says <strong>tmux is not installed here</strong>, sessions can't be kept for you on it.</p>

<h2>Reconnecting</h2>
<p>When the connection drops (sleep, a new network, the VPN going away), the tab says so and offers the way
back:</p>
<ul>
<li><strong>Wulver disconnected. Your session should still be running there.</strong> with <strong>Reconnect to
Wulver</strong>. Once the cluster is back, the tab attaches to the session again by itself.</li>
<li><strong>You left this session. It is still running.</strong> with <strong>Attach again</strong>, when you
detached from tmux yourself.</li>
<li><strong>This session has ended.</strong> when the session is gone, for example because the shell in it
exited or the compute node's time ran out. Close the tab or start a new one from the list.</li>
</ul>

<h2>The timeline</h2>
<p>A long build or training run prints far more than fits on the screen. The timeline is a map of the whole
session, so you can find your way around it. It works on tmux sessions.</p>
<ul>
<li><strong>The map</strong> runs along the right edge of the terminal. It shows the shape of the session's
output, with prompts and tables marked in color, your marks as small blue flags, and a band for the part you are
looking at. Hover it to see the line number; drag it to read any part of the history.</li>
<li><strong>Scroll up</strong> in the terminal, or drag the map, and a calm copy of the history opens over the
terminal. The session underneath keeps running and nothing is sent to it.</li>
<li><strong>Back to live</strong>, at the bottom, takes you back. It shows how many new lines came in while you
were reading, like <em>+120</em>. <kbd>Esc</kbd> does the same, and so does starting to type.</li>
<li>The bar above the terminal has <strong>Previous prompt</strong> and <strong>Next prompt</strong> to jump
between the commands you ran, and <strong>Previous mark</strong> and <strong>Next mark</strong>.</li>
</ul>
<h3>Marks</h3>
<p>A mark is a named place in the history, like a bookmark: the line where the error started, the table of
results, the command that finally worked.</p>
<ol>
<li>While reading the history, click the gutter at the left of a line, or press <kbd>M</kbd>. A click on a
table marks the whole table.</li>
<li>Give it a name in <strong>Name this mark</strong> and press <strong>Save</strong>.</li>
</ol>
<p>The <strong>Marks</strong> button, with the count, lists them. Click one to jump to it; each has
<strong>Copy</strong>, <strong>Rename</strong> and <strong>Remove</strong>.</p>
<p>Marks are kept on the cluster, in your home folder, with the text of the marked lines. That means:</p>
<ul>
<li>Every device signed in to the cluster sees the same marks, your phone too.</li>
<li>When tmux has trimmed old lines, or the session has ended, a mark still has its text. It shows as
<strong>Saved copy</strong>, and you can read and copy it.</li>
</ul>

<h2>Terminal settings</h2>
<p>In <strong>Settings</strong>, under <strong>Terminals</strong>:</p>
<ul>
<li><strong>Select to copy</strong>: highlight text with the mouse to copy it.</li>
<li><strong>Monitoring bar</strong>: CPU, memory and network of the host, under each terminal.</li>
</ul>

<h2>Pasting scripts</h2>
<p>A script that starts with <code>set -e</code> stops at the first command that fails. Pasted into a
terminal, that stop is the shell itself exiting, which ends the session. Save the script to a file and run it
with <code>bash</code> instead:</p>
<pre><code>bash setup.sh</code></pre>
<p>More in <a href="troubleshooting.html#a-pasted-script-closed-my-terminal">Troubleshooting</a>.</p>
""")


add("agents", "agents.html", "AI agents", "AI agents",
    "Run Claude, ChatGPT (Codex), Antigravity or Cursor on a compute node, next to your code and data. They keep "
    "working when you close the app, and you decide which commands they may run without asking.",
    """
<h2>Before you start</h2>
<p>HPC Hub starts the agent's own program on the cluster, so it has to be installed in your account there, and
you need your own account with that agent's company. The <strong>Ask all</strong> window shows <strong>Not
installed</strong> next to any agent it can't find on the cluster.</p>
<p>The four agents are <strong>Claude</strong>, <strong>ChatGPT</strong> (Codex), <strong>Antigravity</strong>
and <strong>Cursor</strong>.</p>

<h2>Start an agent</h2>
<p>Open <strong>Agents</strong> on a cluster card and pick one, or press <strong>Open</strong> on a project and
pick it under <strong>Agents</strong>. The window, for example <strong>Claude on Wulver</strong>, has:</p>
<ul>
<li><strong>Task (optional)</strong>: a first thing to work on, like <em>Fix the failing test in
train.py</em>.</li>
<li><strong>Folder</strong>: where it works.</li>
<li><strong>Use a new compute node</strong>: off, it shares your node with your terminals; on, it gets a node
just for itself. With no node yet, the window asks for the size.</li>
<li><strong>Remote control</strong> (see below), and the agent's own options, such as <strong>Model</strong>,
<strong>Effort</strong>, <strong>Permission mode</strong> or <strong>Sandbox</strong>.</li>
</ul>
<p>Press <strong>Start</strong>. The agent opens in a terminal tab.</p>
<h3>Continue a chat</h3>
<p>Under <strong>Or continue a chat</strong>, the same window lists your earlier chats with that agent on the
cluster, newest first, with a search box when there are many. Click one to pick up where you left off.</p>

<h2>It keeps running</h2>
<p>An agent runs in a tmux session on a compute node and keeps going when you close the app. The
<strong>Running</strong> tab of the <strong>Agents</strong> page lists every agent running on your clusters; click
one to open it again. Like a terminal on a node, an agent stops when its node's time is up.</p>

<h2>Remote control</h2>
<p>Some agents can be used from another device while they run on the cluster:</p>
<ul>
<li><strong>Claude</strong>: <strong>Remote control</strong> lets you use the session from claude.ai/code or the
Claude app.</li>
<li><strong>ChatGPT</strong>: <strong>ChatGPT remote</strong> lets you use it from the ChatGPT app, one session at
a time. A pairing code shows in the terminal; in the ChatGPT app open Codex, connect a machine and enter
it.</li>
<li><strong>Antigravity</strong>: <strong>Remote control</strong> lets you use it from Antigravity on another
device.</li>
</ul>

<h2>Ask all</h2>
<p><strong>Ask all agents</strong>, in a project's <strong>Open</strong> window, puts one question to several agents
at once, for example <em>Which of these two plotting scripts is easier to maintain, and why?</em></p>
<ul>
<li><strong>Prompt</strong>, <strong>Folder</strong>, and <strong>Answers go to</strong> (a new folder inside the
one above, unless you name one).</li>
<li><strong>Who answers</strong>: switch each agent on or off.</li>
<li><strong>Let them read each other's answers</strong>: each one answers again after reading the others.</li>
</ul>

<h2>Permissions</h2>
<p>The <strong>Permissions</strong> tab of <strong>Agents</strong> sets what Claude may do on a cluster without
asking you. It is saved in Claude's own settings on that cluster, so it applies however you start Claude there.
Running Claude sessions pick up a change when they restart.</p>
<ul>
<li><strong>Edit files without asking</strong>.</li>
<li><strong>Move deleted files to the trash</strong>: instead of deleting, files go to a trash folder and are
kept for 7 days.</li>
<li><strong>Ask first</strong>: cancelling jobs, force pushing, and throwing away unsaved changes always ask.</li>
<li><strong>Run without asking</strong>: groups of commands, such as <em>Read and search</em>,
<em>Files</em>, <em>Code and builds</em>, <em>Jobs</em>, <em>Git</em> and <em>Network</em>, each with a short note
on what it allows. <strong>Add a command</strong> adds one of your own. Anything not allowed here asks you
first.</li>
</ul>
<p>ChatGPT and Antigravity ask before running commands.</p>
<h3>Passcode lock</h3>
<p>The <strong>Passcode lock</strong> on the same tab guards Claude on a cluster. Once it is set up with Google Authenticator or another authenticator app, Claude takes no messages until you start one with
the current code, like <code>123456 fix the tests</code>. You choose how long a code lasts and how many wrong
codes are allowed before it locks; <strong>Recent activity</strong> shows what happened.</p>

<h2>VS Code on a compute node</h2>
<p><strong>VS Code</strong> on a cluster card starts VS Code on a compute node as a job of its own, through a VS
Code tunnel. When the tunnel is ready the terminal says <strong>VS Code is ready</strong> with <strong>Open in
browser</strong>. The first time, GitHub asks you to sign in.</p>
<div class="note"><p>VS Code keeps that GitHub sign-in in your home folder on the cluster, unencrypted, so a tunnel
on a new node doesn't ask again. Run <code>code tunnel user logout</code> on the cluster if you don't want
that.</p></div>

<h2>Experimental tabs</h2>
<p><strong>Skills</strong> and <strong>Scheduled</strong> are two more tabs of Agents. They are experimental and
off by default. See <a href="experimental.html">Experimental features</a>.</p>
""")


add("jobs", "jobs.html", "Jobs", "Jobs",
    "The Jobs page shows what is running and waiting on a cluster, in plain words, with details and cancel.",
    """
<h2>Which jobs</h2>
<p>Pick the cluster at the top of the window, then choose under <strong>Which jobs</strong>:</p>
<ul>
<li><strong>My jobs</strong>: running and waiting now.</li>
<li><strong>My group</strong>: everyone in your groups. With more than one group, a second list picks one.</li>
<li><strong>My history (7 days)</strong>: your jobs from the last week, finished ones too.</li>
<li><strong>All jobs</strong>: everyone's jobs on the cluster.</li>
</ul>
<p><strong>State</strong> filters by running, waiting, finished, failed, cancelled or ran out of time. The search
box finds a job by id, name, person or queue, for example <code>jdoe</code>.</p>

<h2>Reading the table</h2>
<div class="table-wrap"><table>
<tr><th>Column</th><th>What it shows</th></tr>
<tr><td>ID, Name, User</td><td>The Slurm job id, its name and who started it.</td></tr>
<tr><td>State</td><td>In plain words: Running, Finished, Failed, Ran out of time, Ran out of memory and so on.</td></tr>
<tr><td>Time used</td><td>How long it has run, out of the time it asked for.</td></tr>
<tr><td>CPUs · memory</td><td>What it asked for.</td></tr>
<tr><td>Hours (SU)</td><td>What it has cost so far.</td></tr>
<tr><td>Node or reason</td><td>Where it runs, or why it is waiting.</td></tr>
</table></div>
<p>The reason a job waits is written out instead of Slurm's code word. Some examples:</p>
<ul>
<li><strong>Waiting: higher-priority jobs go first</strong></li>
<li><strong>Waiting: not enough free nodes yet</strong></li>
<li><strong>Waiting: maintenance has to finish first</strong></li>
<li><strong>Waiting: your group is out of SUs</strong></li>
<li><strong>Won't start: longer than this queue allows</strong></li>
</ul>
<p>On a narrow window some columns are hidden; <strong>Details</strong> shows everything.</p>

<h2>Details and cancel</h2>
<p>Click a job to open its details: the time used, its folders and output files (each with <strong>Copy
path</strong>), and <strong>All fields</strong> for everything Slurm knows.</p>
<p>The <strong>&#8942;</strong> on a row has <strong>Details</strong> and <strong>Cancel job</strong>. Cancel
always asks first. To cancel several, tick them and use the bar that appears.</p>
<p>If the job is the node HPC Hub got for you, cancelling it is <strong>Release node</strong>, and the app warns
that your terminals on that node stop too.</p>

<h2>Submitting a job</h2>
<p>Open your Slurm script in <strong>Code</strong> (from Files, a project or a job's folder). For a Slurm script,
the bar above the file has <strong>Submit job</strong>. The new job shows up here.</p>

<h2>Notifications</h2>
<p>While a cluster is connected, HPC Hub checks your jobs about once a minute and tells you when one ends, for
example <em>Wulver: job 123456 ended</em>. Clicking the notification opens Jobs.</p>
""")


add("usage", "usage.html", "Usage and SUs", "Usage and SUs",
    "How many SUs your group has left, how fast they are going, who used them, how full your storage is, and "
    "how busy the queues are.",
    """
<h2>What an SU is</h2>
<p>An SU (service unit) is the cluster's currency. One SU is roughly one core for one hour; GPUs, memory and
some queues count differently. Your group (your lab's allocation) gets a number of SUs, and every job billed to
it uses some. Free queues still count core hours, but cost 0 SU.</p>
<p>Each queue's price is on the <a href="compute-nodes.html#the-limits-tab">Limits</a> tab, and the node window
shows the <strong>Cost</strong> before you ask for a node.</p>

<h2>The tabs</h2>
<p>Pick the cluster at the top of the window, then a tab:</p>
<h3>Overview</h3>
<p>One card per group you belong to, on every connected cluster. Each card has:</p>
<ul>
<li>The big number: <strong>SUs left</strong>, or SUs used when the group has no limit.</li>
<li>A bar of what is used, with your part in it.</li>
<li>A line about the pace, such as <em>About 20 days left at the pace of the last month</em> or <em>Plenty for
the year at this pace</em>.</li>
<li>SUs per week for the last 12 weeks, where the cluster keeps them.</li>
<li>At the bottom, how much you used, and when the allocation ends.</li>
</ul>
<p>A red tag says <strong>Near the limit</strong> or <strong>Used up</strong>. Click a card to see who used it.</p>
<h3>Hours</h3>
<p>For one group (<strong>Group to bill</strong>) and a period (the last 7, 30 or 90 days, or the last year):
the hours left or used, and <strong>Who used it</strong>, one row per person. Click a person to see their jobs on
the Jobs page.</p>
<h3>Storage</h3>
<p>Your quotas: home, project, scratch and so on, how full each is, and how much of it is yours. Click a row to see
who uses a shared space. Scratch rows say when files are deleted, with <strong>See what is at risk</strong>, which
opens <a href="backup.html">Backup</a>.</p>
<h3>Queues</h3>
<p>How busy each queue is right now: how many CPUs are busy, how many jobs run and how many wait.</p>
<h3>Limits</h3>
<p>The most one job can ask for on each queue, and what it costs. See
<a href="compute-nodes.html#the-limits-tab">The Limits tab</a>.</p>

<h2>When numbers are missing</h2>
<p>Clusters don't all keep the same records. Where a cluster doesn't say, the app says so instead of guessing,
for example <em>SUs per week are not available on this cluster</em> or <em>The pace is not known on this
cluster</em>.</p>
""")


add("files", "files.html", "Files, transfers and Globus", "Files, transfers and Globus",
    "Browse your folders on every cluster, preview and edit files, upload and download, and copy between "
    "clusters through your laptop or with Globus.",
    """
<h2>Browse</h2>
<p>The <strong>Browse</strong> tab of <strong>Files</strong> shows one cluster at a time. On the left are your
places (home and the cluster's other storage); at the top, the path, which you can type into. Click a file to
preview it: PDFs, images and text show next to the list.</p>
<p>Right-click a file or folder (or use its menu) for:</p>
<ul>
<li><strong>Open</strong>, and <strong>Edit in Code</strong> for text files.</li>
<li><strong>Download</strong>, <strong>Rename</strong>, <strong>Copy path</strong>.</li>
<li><strong>Make a zip</strong>, or <strong>Extract here</strong> for an archive. Both run on the cluster.</li>
<li><strong>Copy, then paste on any cluster</strong>.</li>
<li><strong>Delete</strong>, which asks first. It deletes for good on the cluster; there is no trash.</li>
</ul>
<p>Right-click empty space for <strong>New folder</strong>, <strong>Upload files here</strong>, <strong>Paste
here</strong>, <strong>Open this folder in Code</strong> and <strong>Copy path</strong>.</p>
<p>The PDF viewer can search the text, zoom, look words up in a dictionary and read the text aloud.</p>

<h2>Copy between clusters</h2>
<ol>
<li>Choose <strong>Copy, then paste on any cluster</strong> on a file or folder.</li>
<li>Go to the other cluster and the folder you want, and choose <strong>Paste here</strong>.</li>
<li>Pick <strong>How</strong>:
<ul>
<li><strong>Through this laptop</strong>: keep HPC Hub open and this computer awake until it is done. Simple,
fine for smaller copies.</li>
<li><strong>Globus</strong>: cluster to cluster, keeps going with the app closed. Much faster for big
folders.</li>
</ul></li>
</ol>
<p>Both clusters have to be connected. The app measures the size first, and tells you when a copy is done.</p>

<h2>Transfers</h2>
<p>The <strong>Transfers</strong> tab lists copies through this laptop at the top, with Globus below it: two
panes, one per cluster, and <strong>Recent transfers</strong> with progress. Select something in one pane and send
it to the other. <strong>Cancel transfer</strong> and <strong>Open in Globus</strong> are on each transfer.</p>

<h2>Set up Globus</h2>
<p>Globus moves big folders between clusters on its own, even with the app closed. It needs a one-time setup.</p>
<ol>
<li><strong>Make a free Globus app id.</strong> At app.globus.org go to Settings, Developers, and register an app.
Choose the one for native applications that are distributed to users, name it HPC Hub, and add the redirect
<code>https://auth.globus.org/v2/web/auth-code</code>. Paste its Client ID under <strong>Set up Globus</strong> and
press <strong>Save</strong>.</li>
<li><strong>Sign in to Globus</strong> with your university login. It opens in your browser. If Globus shows a
code, paste it back into the app.</li>
<li><strong>Collections.</strong> HPC Hub finds each cluster's Globus collection by itself. If it can't, pick it
from the list.</li>
<li><strong>Permissions.</strong> When a collection needs your OK, the app shows <strong>Globus needs your
permission</strong>. Press <strong>Allow</strong>; it asks only for what Globus needs.</li>
</ol>
<p>On some clusters your Globus collection only works while Globus Connect runs there. If it isn't running, the
app says so and offers to start it on the login node.</p>
""")


add("projects", "projects.html", "Projects and moving between clusters", "Projects and moving between clusters",
    "A project is a named folder on a cluster. Open it in your tools in one click, and copy or sync it to another "
    "cluster together with its Claude chats.",
    """
<h2>Make or add a project</h2>
<p>On the <strong>Projects</strong> page:</p>
<ul>
<li><strong>New project</strong> makes a new folder: a <strong>Name</strong> (like <code>thesis</code>), the
<strong>Cluster</strong>, what to <strong>Start with</strong> (Empty, LaTeX paper or Python), whether to
<strong>Make it a git repository</strong>, and where to make it.</li>
<li><strong>Add folder</strong> turns a folder you already have into a project.</li>
</ul>
<p>The list shows each project's folder, cluster, group, when you last opened it, what is running in it and its
git branch. The <strong>&#8942;</strong> menu has <strong>Edit</strong>, <strong>Copy path</strong> and
<strong>Remove from the list</strong>. Removing only takes it off the list; the folder on the cluster stays.</p>
<div class="note"><p>Scratch gets cleaned up. Keep work you need in your project space. See
<a href="backup.html">Backup of scratch</a>.</p></div>

<h2>Open a project</h2>
<p><strong>Open</strong> connects to the cluster if needed and offers: <strong>Code</strong>,
<strong>Files</strong>, <strong>Terminal</strong>, <strong>VS Code</strong>, and under <strong>Agents</strong>,
Claude, ChatGPT, Antigravity, Cursor and <strong>Ask all agents</strong>. With Papers turned on there is also
LaTeX. Each one starts in the project's folder.</p>

<h2>Copy or sync to another cluster</h2>
<p>Moving to a new cluster, or keeping a copy of your work on two? <strong>Copy or sync</strong> on a project
does it in one window:</p>
<ol>
<li><strong>Where</strong>: the cluster and the folder to put it in. The app suggests your project space
there.</li>
<li><strong>How</strong>:
<ul>
<li><strong>Globus</strong>: cluster to cluster, for big projects. Copying again only sends what changed, so
it works as a sync. Globus has to be set up first (Files, Transfers).</li>
<li><strong>Through this laptop</strong>: simple, fine for smaller projects.</li>
</ul></li>
<li><strong>What to take</strong>: the app measures the project's parts. Untick what stays behind, such as large
outputs you can make again.</li>
<li><strong>Claude chats</strong>: tick the chats to keep going there. They move with the project, so you can
continue them on the new cluster.</li>
</ol>
<p>Press <strong>Copy</strong> or <strong>Sync</strong>, with the size on the button. Both clusters must be
connected. Progress shows under <strong>Copies</strong> on the Projects page, where <strong>Stop copy</strong> can
stop it.</p>
<p>Copying to another folder on the same cluster works too. The cluster copies it itself, on your compute
node, and copying again only sends what changed.</p>
""")


add("backup", "backup.html", "Backup of scratch", "Backup of scratch",
    "Scratch is fast, but most clusters delete old files there. The backup agent finds what is at risk and "
    "copies the work that matters to your project folder before it goes.",
    """
<h2>Why scratch needs a backup</h2>
<p>Each cluster has its own rule for how long files may stay in scratch before they are deleted (purged). When the app was written, the clusters' own docs said:</p>
<ul>
<li>Wulver deletes scratch files after 30 days, and may delete sooner when scratch is very full.</li>
<li>Yale deletes scratch files after 30 days. The app reads the number from the cluster when it can.</li>
<li>Expanse deletes scratch files 90 days after they were made.</li>
</ul>
<p>If a cluster states a different number, the app uses the cluster's. HPC Hub never touches files to make them
look newer; the clusters don't allow that.</p>

<h2>Where to find it</h2>
<ul>
<li><strong>Agents</strong>, the <strong>Backup</strong> tab.</li>
<li><strong>Usage</strong>, <strong>Storage</strong>: <strong>See what is at risk</strong> on a scratch row.</li>
<li>A note when scratch files are close to deletion, like <em>Some scratch files go in 5 days</em> (with the date), with
<strong>See the plan</strong>. You also get a notification.</li>
</ul>

<h2>The steps</h2>
<p>The backup goes through five steps, shown at the top: Check, At risk, Plan, Space and Copy.</p>
<h3>Check</h3>
<p><strong>Check my scratch</strong> looks at every file. It takes about 20 minutes, and you can close the app
meanwhile. <strong>Let Claude sort unclear folders</strong> lets Claude help decide what a folder is; Claude only
looks, and can't change or run anything.</p>
<h3>At risk</h3>
<p>How many files go in the coming days, how big they are and in which folders, grouped into <em>Could be deleted
any day now</em>, <em>Within a week</em>, <em>Within 2 weeks</em> and <em>Later</em>.</p>
<h3>Plan</h3>
<p>Each folder is marked <strong>Keep</strong> or <strong>Leave out</strong>, and you can change any of them.
Options: <strong>Copy whole folders so each one stays complete</strong> (git repositories are always copied
whole), and <strong>Only files deleted in the next 14 days</strong>.</p>
<h3>Space</h3>
<p>How much of your project folder the copy uses, and how full it will be after. If it doesn't fit,
<strong>Leave out the biggest ones that can be made again</strong> or <strong>Put code in home</strong>.
<strong>Try it first</strong> makes the list of files and checks the space without copying anything.</p>
<h3>Copy</h3>
<p>The copy runs on the cluster, so you can close the app. <strong>Stop copy</strong> keeps what was copied so
far; start again later and it goes on from there. At the end, every file is checked against the one in
scratch.</p>
<p>Nothing in scratch is changed or deleted. If a file in project is older than the one in scratch, it is
replaced and the old one is kept in <code>.hpc-hub-replaced</code>. Files a job is still writing are left for
next time, and the app says how many.</p>

<h2>Weekly check</h2>
<p><strong>Reminders</strong> can run <strong>Check scratch every week</strong> on a day and time you choose. It
runs on the cluster, even with your laptop off. You also choose how early to hear about it, like <em>Tell me when
files are 14 days from deletion</em>.</p>
""")


add("phone", "phone.html", "Phone app", "Phone app",
    "The Android app has the same pages as the desktop, made for a phone. Sign it in by scanning a code from your "
    "computer.",
    """
<div class="note"><p>The phone app is not on any store yet. See <a href="install.html#android">Install</a>.</p></div>

<h2>Scan from your computer</h2>
<p>The first start asks which clusters you use, then for each one offers <strong>Scan from your
computer</strong>, <strong>Type it instead</strong> or <strong>Do this later</strong>.</p>
<p>To scan:</p>
<ol>
<li>On your computer, open <strong>Settings</strong> in HPC Hub and choose <strong>Set up the phone app</strong>.
(The <strong>&#8942;</strong> menu on a cluster card has <strong>Connect phone</strong> for just that
cluster.)</li>
<li>Pick the logins to send. <strong>Include passwords</strong>: on, the phone signs in by itself; off, the phone
asks for each password.</li>
<li>Press <strong>Show QR code</strong> and scan it with the phone. The code hides itself after a minute.</li>
</ol>
<p>One code can carry several clusters. For a cluster that uses SSH keys, the phone gets a key of its own instead
of a copy of yours. Duo still asks when the phone connects.</p>

<h2>Finding your way around</h2>
<p>The menu at the top left has the same pages, in the same order, as the desktop's sidebar, and
<strong>Settings</strong> at the bottom. Android's Back closes the sheet on top first, then goes to Clusters.
Long-press a row (a session, a file, a project) for its actions.</p>

<h2>Stay connected in the background</h2>
<p>Android can close HPC Hub's connection when you lock the phone or switch apps. Two settings keep it open, under
<strong>Settings</strong>, <strong>On the phone</strong>:</p>
<ul>
<li><strong>Stay connected in the background</strong>: keeps your connections open, with a notification like
<em>Connected to Wulver</em>. It uses a little more battery while a cluster is connected.</li>
<li><strong>Run without battery limits</strong>: so Android doesn't close your connections to save battery. Tap
<strong>Turn on</strong> and Android asks you to allow it.</li>
</ul>
<p>The app offers both once, after your first connect. If you said <strong>Not now</strong>, turn them on in
Settings.</p>

<h2>Notifications</h2>
<p>The phone can tell you when Duo is waiting, a cluster connected, your node's time is almost up, a job ended, a
copy finished, an agent answered, scratch files are about to be deleted, or a backup finished. Pick which ones in
<strong>Settings</strong>, <strong>Notifications</strong>. Tapping one opens the right page.</p>

<h2>Terminals on the phone</h2>
<ul>
<li><strong>Swipe to scroll.</strong> Swipe up and down on the terminal to move through its history, as a mouse
wheel would. A tap opens the keyboard.</li>
<li><strong>The key row</strong> over the keyboard has <strong>Esc</strong>, <strong>Tab</strong>,
<strong>Ctrl</strong>, <strong>Alt</strong>, the arrows and a few symbols that are hard to reach on a phone
keyboard. Tap <strong>Ctrl</strong> or <strong>Alt</strong> to see the keys that go with it, like
<strong>^C</strong>.</li>
<li><strong>The timeline</strong> works as on the desktop. The marks list opens from the bottom, and Back leaves
the history. Marks you made on the computer are there too.</li>
</ul>

<h2>VPN on the phone</h2>
<p>The phone uses the same university VPN, but only for HPC Hub's own connections. Nothing else on the phone goes
through it, and several clusters can be connected at once.</p>

<h2>Your passwords on the phone</h2>
<p>The phone keeps logins in an encrypted file in the app's private storage. Its key is held by the phone's
Android Keystore and never leaves the phone, and the file is left out of Android backups.</p>
""")


add("experimental", "experimental.html", "Experimental", "Experimental features",
    "Three parts of HPC Hub are still taking shape. They are off by default, and each has its own switch.",
    """
<div class="exp"><p>Turn them on in <strong>Settings</strong>, under <strong>Experimental</strong>. As the app
says there, they may change or break.</p></div>

<h2>Papers (LaTeX)</h2>
<p>The <strong>Papers</strong> switch adds a Papers page to the sidebar: an editor for LaTeX papers that live in a
project on the cluster, with builds done there.</p>
<ul>
<li>Views: <strong>Editor</strong>, <strong>Both</strong> (source and PDF side by side), <strong>PDF</strong> and
<strong>Reader</strong>.</li>
<li>Builds with latexmk, and jumps between a line of source and its place in the PDF.</li>
<li>Git: commit, pull and push.</li>
<li><strong>History</strong>: a timeline of the paper's changes, comparing versions, who last changed each line
and why, and notes. Notes are kept next to the paper in <code>.git</code>, and are never committed or
pushed.</li>
<li>Assist: <strong>Ask about</strong> asks the agent about the selected text or a line, and the agent can write
commit messages and compare your open notes with your changes. You decide each one.</li>
</ul>
<p>With Papers on, <strong>Settings</strong> also has <strong>Agent for papers</strong>, the agent used for this.
It runs on your compute node. A new project can start as a <strong>LaTeX paper</strong>.</p>

<h2>Skills</h2>
<p>The <strong>Skills</strong> switch adds a Skills tab to <strong>Agents</strong>: what each agent knows on a
cluster. Add skills to the agents on each cluster, from HPC Hub's own set or from any git repository.</p>

<h2>Scheduled agents</h2>
<p>The <strong>Scheduled agents</strong> switch adds a Scheduled tab to <strong>Agents</strong>: an agent runs a
task on its own at set times, for example every night at 02:00. Each run is a Slurm job on the cluster, so it
runs with your laptop off and is billed like any other job. Each run keeps a log you can read.</p>
""", experimental=True)


add("troubleshooting", "troubleshooting.html", "Troubleshooting", "Troubleshooting",
    "What to do when a cluster won't connect, a terminal closes, Duo times out or the phone drops the "
    "connection.",
    """
<h2>Can't reach the VPN or the cluster on some networks</h2>
<p>The card says something like <strong>Can't reach Wulver from this network. Is the VPN on?</strong> or
<strong>Can't get through to Yale from this network.</strong>, but the same thing worked at home.</p>
<p>Some networks block VPN connections or SSH: guest Wi-Fi, eduroam on some campuses, hotels and conference
networks. There is nothing to fix in the app. Try another network, or your phone's mobile data (a hotspot works
for the laptop too), then press <strong>Try again</strong>.</p>

<h2>A pasted script closed my terminal</h2>
<p>You pasted a script into a terminal, a command in it failed, and the session ended (<strong>This session has
ended.</strong>).</p>
<p>The script most likely has <code>set -e</code> near the top. It tells the shell to quit as soon as a command
fails. In a script, that stops the script. Pasted into a terminal, it stops the terminal's own shell, and the
session ends with it.</p>
<p>Save the script to a file and run it with bash, in a new terminal:</p>
<pre><code>nano setup.sh      # paste the script, save
bash setup.sh</code></pre>
<p>It runs in its own shell, so when it stops, your terminal stays.</p>

<h2>Duo timed out</h2>
<p>The card says <strong>Duo wasn't approved in time. Click Try again and approve the push on your
phone.</strong></p>
<ul>
<li>Duo pushes expire after about a minute. While the app waits it shows a timer; after a while it offers
<strong>Send a new push</strong>.</li>
<li>Check that the Duo app on your phone can receive pushes: open it once, and make sure its notifications are
on.</li>
<li>The HPC Hub phone app can tell you when Duo is waiting (Settings, Notifications).</li>
<li>Then press <strong>Try again</strong> on the card.</li>
</ul>

<h2>The phone app drops the connection in the background</h2>
<p>Android closes connections of apps in the background to save battery. In the phone app, open
<strong>Settings</strong>, <strong>On the phone</strong>, and turn on both:</p>
<ul>
<li><strong>Stay connected in the background</strong></li>
<li><strong>Run without battery limits</strong></li>
</ul>
<p>Some phones have extra battery savers of their own. If it still drops, look for HPC Hub in the phone's battery
settings and allow it to run in the background. Your terminal sessions keep running on the cluster either way;
they reattach when the phone connects again.</p>

<h2>Waiting a long time for a node</h2>
<p><strong>Waiting for a free node</strong> usually takes under a minute, longer when the cluster is busy. A
smaller node, a shorter time or another queue often starts sooner; <strong>Usage</strong>,
<strong>Queues</strong> shows how busy each one is. Also check for the
<a href="compute-nodes.html#the-maintenance-warning">maintenance warning</a>.</p>

<h2>Yale hasn't picked up my key</h2>
<p><strong>Yale hasn't picked up your key yet. It can take up to 10 minutes.</strong> Wait a few minutes and press
<strong>Try again</strong>. Yale's key page only loads on campus or on the VPN; use <strong>Connect VPN
only</strong> from the card's <strong>&#8942;</strong> menu to open it from elsewhere.</p>

<h2>"The server looks different from last time"</h2>
<p>This means the cluster's server identity changed since you last connected. It can be a planned change, but
check with the cluster's HPC team before you connect.</p>

<h2>The cluster says my password is wrong</h2>
<p>For example <strong>Wulver didn't accept your UCID or password. Check them in Settings, then try
again.</strong> Open the gear on the cluster card, then <strong>Sign-in</strong>, and type the password again. On
Expanse, check the code from your authenticator app as well.</p>

<h2>The VPN won't start on Windows or macOS</h2>
<p>The first VPN connect needs the VPN helper, which asks for permission once (the Windows prompt, or your Mac
password). If you declined it, connect again and approve it.</p>

<h2>Globus copies don't start</h2>
<ul>
<li>Globus needs the one-time setup in <a href="files.html#set-up-globus">Files, Transfers</a>.</li>
<li><strong>Globus Connect is not running</strong> on a cluster: let the app start it on the login node.</li>
<li><strong>Globus needs your permission</strong>: press <strong>Allow</strong>.</li>
</ul>

<h2>Still stuck?</h2>
<p><a href="report-a-problem.html">Report a problem</a> from the app.</p>
""")


add("report", "report-a-problem.html", "Report a problem", "Report a problem",
    "Something broken or confusing? HPC Hub can send a report for you, and you read every word of it before it "
    "goes.",
    """
<h2>Where to find it</h2>
<ul>
<li><strong>Settings</strong>, then <strong>Report a problem</strong>, for anything you noticed.</li>
<li>A quiet <strong>Report</strong> next to an error: on a cluster card that failed to connect, in an error
message at the bottom of the window, or on a page that couldn't load. The report then starts with that
error.</li>
<li>If a page breaks completely, it shows <strong>Reload</strong> and <strong>Report it</strong> instead of a blank
window. Your clusters, jobs and files are not affected.</li>
</ul>

<h2>Sending a report</h2>
<ol>
<li>Write what went wrong under <strong>What went wrong?</strong>: what you did, what you expected, and what
happened instead.</li>
<li>If you'd like an answer, add your email. It is optional.</li>
<li>Tick <strong>Add a screenshot of the window</strong> if a picture helps. It shows whatever is on screen, so
look at it first; it appears in the window before anything is sent.</li>
<li>Read <strong>Everything that will be sent</strong>, then press <strong>Send report</strong>.</li>
</ol>
<p>When it has gone, the window says <strong>Report sent</strong> and gives the report a number. Use that number
if you write about it later.</p>

<h2>What is sent, and what is not</h2>
<ul>
<li><strong>Nothing is sent until you press Send.</strong> Cancel, or close the window, and nothing leaves your
computer.</li>
<li><strong>You see exactly what is sent.</strong> The box <strong>Everything that will be sent</strong> holds the
whole report: the app's version and your system, the page you were on, the error, your note, your email if you
gave one, and the app's recent log.</li>
<li><strong>Personal details are removed first.</strong> Names, folders and addresses are replaced with
placeholders such as <code>&lt;user&gt;</code>, <code>&lt;home&gt;</code>, <code>&lt;account&gt;</code> and
<code>&lt;ip&gt;</code>, also in what you type.</li>
<li><strong>Passwords are never included.</strong> Tokens, cookies and keys become <code>&lt;hidden&gt;</code>.</li>
</ul>

<h2>Other ways</h2>
<p>You can also open an issue on the <a href="https://github.com/bavanDA/hpc-hub/issues">GitHub repository</a>.
Issues there are public, so leave out usernames, group names, paths and anything else about you or your
work.</p>
""")


add("faq", "faq.html", "FAQ", "Questions and answers",
    "Privacy, cost and what keeps running when you close the app.",
    """
<h2>Where are my passwords kept?</h2>
<p>Usernames and passwords are typed into the app and kept in your system's keyring:</p>
<ul>
<li>Linux: GNOME Keyring (the Secret Service)</li>
<li>macOS: the Keychain</li>
<li>Windows: Credential Manager</li>
<li>Android: an encrypted file whose key stays in the phone's Keystore</li>
</ul>
<p>Never in plain text, and never in the app's settings files. Globus sign-in happens in your own browser, and
its tokens go in the keyring too.</p>

<h2>Does HPC Hub send my data anywhere?</h2>
<p>No. There is no tracking and no account with HPC Hub. The app connects to your clusters, their VPN and
sign-in pages, and the services you choose to use, such as Globus, or an AI agent's company when you run that
agent. The PDF viewer's dictionary and read aloud use online services when you use them.</p>
<p>The one thing HPC Hub ever sends about you or the app is a <a href="report-a-problem.html">problem report</a>,
only when you press Send, and only after you have read it.</p>

<h2>Does HPC Hub cost SUs?</h2>
<p>The app itself doesn't. Your compute node, VS Code and agents are Slurm jobs, and the cluster bills them like
any other job, by the queue and priority you pick. The node window shows the cost before you ask for a node. A
whole-node queue bills for the whole node; see
<a href="compute-nodes.html#what-a-whole-node-queue-means">what a whole-node queue means</a>.</p>

<h2>What keeps running when I close the app?</h2>
<p>Terminals, agents, VS Code and your compute node keep running on the cluster, until you stop them or the node's
time is up. Globus transfers, backup copies and scheduled agents run on their own too. Copies <em>through this
laptop</em> need the app open.</p>
<p>To release your nodes as you leave, use <strong>Settings</strong>, <strong>Disconnect all and quit</strong>.
Jobs you started yourself and VS Code jobs keep running.</p>

<h2>Can I use a cluster that isn't listed?</h2>
<p>HPC Hub comes set up for Wulver (NJIT), Bouchet (Yale) and Expanse (SDSC). Show or hide them in
<strong>Settings</strong>, <strong>Clusters</strong>.</p>

<h2>Can I use the phone and the computer at the same time?</h2>
<p>Yes. Both connect to the same clusters, see the same sessions and the same terminal marks. Duo asks on each
device when it connects.</p>

<h2>Why does my system warn me when I open the app?</h2>
<p>The installers are not signed yet. See <a href="install.html">Install</a> for how to open it the first
time.</p>

<h2>Is it open source?</h2>
<p>Yes, under the MIT license. The code is on <a href="https://github.com/bavanDA/hpc-hub">GitHub</a>.</p>

<h2>How do I change the colors?</h2>
<p><strong>Settings</strong>, <strong>Appearance</strong>. <strong>System</strong> follows your computer's light or
dark mode, and there are a few more themes to pick from.</p>
""")
