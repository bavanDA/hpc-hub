"""What finished Slurm jobs really used, from sacct, kept in ~/.hpc-hub/job-sizes.json (part of hpchub-size).

Runs on the cluster's own python3, which may be 3.6: no dataclasses, walrus or capture_output.
"""
import json
import math
import os
import posixpath
import re
import shlex
import subprocess
import time

STORE = os.path.expanduser("~/.hpc-hub/job-sizes.json")
FIELDS = "JobID,JobName,State,Elapsed,TotalCPU,AllocCPUS,ReqMem,MaxRSS,NNodes,NTasks,NodeList,Partition,WorkDir"
FIRST_DAYS, OVERLAP = 60, 900  # the first look goes back 60 days; later ones from the last look, a bit before it
KEEP_RUNS, KEEP_KINDS = 20, 300
ACTIVE = ("PENDING", "RUNNING", "REQUEUED", "SUSPENDED", "COMPLETING", "CONFIGURING", "RESIZING")
UNITS = {"B": 1 / 1048576, "K": 1 / 1024, "M": 1, "G": 1024, "T": 1048576}
# sbatch options that take no value (the others take the next word when written without "=")
BOOL_LONG = {"exclusive", "hold", "parsable", "wait", "requeue", "no-requeue", "test-only", "overcommit",
             "contiguous", "use-min-nodes", "spread-job", "ignore-pbs", "quiet", "verbose", "get-user-env",
             "no-kill", "help", "usage", "version", "oversubscribe", "reboot", "nice", "propagate"}
BOOL_SHORT = set("HWOQvVhks")
SHORT = {"c": "cpus-per-task", "n": "ntasks", "N": "nodes", "p": "partition", "t": "time", "J": "job-name"}


def number(text, default=0):
    try:
        return int(str(text).strip())
    except ValueError:
        return default


def megabytes(text, bare="M"):
    """'38123456K', '1.5G', '4000Mc', '16G' -> MB; None when it says nothing. bare: the unit of a plain number."""
    m = re.match(r"^\s*(\d+(?:\.\d+)?)\s*([BKMGT]?)", text or "", re.I)
    return float(m.group(1)) * UNITS[(m.group(2) or bare).upper()] if m else None


def per_node(req_mem, cpus, nodes):
    """sacct's ReqMem as memory per node: old Slurm writes per core (4000Mc) or per node (256Gn), newer the job."""
    mb = megabytes(req_mem)
    if mb is None:
        return None
    tail = req_mem.strip()[-1:].lower()
    return mb * cpus / max(nodes, 1) if tail == "c" else mb if tail == "n" else mb / max(nodes, 1)


def seconds(text):
    """Elapsed or TotalCPU, [D-][HH:]MM:SS[.mmm], in seconds; 0 when unknown."""
    text = (text or "").strip()
    days, _, rest = text.rpartition("-")
    try:
        parts = [float(p) for p in rest.split(":")]
        d = int(days) if days else 0
    except ValueError:
        return 0
    if len(parts) > 3:
        return 0
    parts = [0.0] * (3 - len(parts)) + parts
    return d * 86400 + parts[0] * 3600 + parts[1] * 60 + parts[2]


def clock(secs):
    secs = int(secs)
    d, rest = divmod(secs, 86400)
    text = "%02d:%02d:%02d" % (rest // 3600, rest % 3600 // 60, rest % 60)
    return "%d-%s" % (d, text) if d else text


def gb(mb):
    g = mb / 1024
    return ("%.0f GB" if g >= 10 else "%.1f GB") % g


def split_sbatch(words):
    """sbatch's words (without 'sbatch') -> (options by long name, script, its arguments)."""
    opts, i = {}, 0
    while i < len(words):
        w = words[i]
        if w == "--":
            i += 1
            break
        if w.startswith("--"):
            key, eq, value = w[2:].partition("=")
            if not eq and key not in BOOL_LONG:
                value, i = (words[i + 1] if i + 1 < len(words) else ""), i + 1
        elif w.startswith("-") and len(w) > 1:
            key, value = SHORT.get(w[1], w[1]), w[2:]
            if not value and w[1] not in BOOL_SHORT:
                value, i = (words[i + 1] if i + 1 < len(words) else ""), i + 1
        else:
            break
        opts[key] = value
        i += 1
    return opts, (words[i] if i < len(words) else ""), words[i + 1:]


def directives(text):
    """The options of a script's #SBATCH lines (Slurm reads them until the first command)."""
    opts = {}
    for line in (text or "").splitlines():
        s = line.strip()
        if not s or s.startswith("#!"):
            continue
        if not s.startswith("#"):
            break
        if s.startswith("#SBATCH"):
            try:
                opts.update(split_sbatch(shlex.split(s[len("#SBATCH"):], comments=True))[0])
            except ValueError:
                pass
    return opts


def kind_of(script, args, workdir, wrap="", name=""):
    """What makes runs "the same job": the script's real path and its arguments (or the --wrap command)."""
    if wrap:
        return "wrap: " + " ".join(wrap.split())
    if not script:
        return "name: " + name
    return " ".join([script_path(script, workdir)] + [shlex.quote(a) for a in args])


def script_path(script, workdir):
    """The script's full path on the cluster. The app (maybe on Windows) reads the same sacct: there the path is
    only joined, with the cluster's / and nothing resolved."""
    if os.name != "posix":
        return posixpath.normpath(posixpath.join(workdir or "/", script))
    return os.path.realpath(os.path.join(workdir or "/", os.path.expanduser(script)))


def first_node(nodelist):
    """n[0042-0044,0050] -> n0042."""
    m = re.match(r"([^\[,]*)(?:\[([^\],-]+))?", nodelist or "")
    return m.group(1) + (m.group(2) or "") if m else ""


def parse_sacct(text, submit=True, kinds=True):
    """sacct -n -P -o FIELDS[,SubmitLine] -> finished runs, one per job, with the peak memory of its steps."""
    width, runs = len(FIELDS.split(",")), {}
    for line in text.splitlines():
        cells = line.split("|")
        if len(cells) < width + submit:
            continue
        jid, name, state, elapsed, total, alloc, req, rss, nodes, tasks, nodelist, part, workdir = cells[:width]
        base, dot, _ = jid.partition(".")
        r = runs.setdefault(base, {"id": base, "peak_mb": None, "oom": False})
        r["oom"] = r["oom"] or state.startswith("OUT_OF_ME")
        if not dot:
            cpus, n = number(alloc), max(number(nodes, 1), 1)
            r.update(name=name, state=(state.split() or [""])[0], elapsed=seconds(elapsed), cpu_s=seconds(total),
                     cpus=cpus, nodes=n, node=first_node(nodelist), partition=part, req_mb=per_node(req, cpus, n))
            if kinds:
                words = shlex_words("|".join(cells[width:])) if submit else []
                sbatch = bool(words) and os.path.basename(words[0]) == "sbatch"
                opts, script, args = split_sbatch(words[1:]) if sbatch else ({}, "", [])
                r["kind"] = kind_of(script, args, workdir, opts.get("wrap", ""), name)
                r["script"] = script_path(script, workdir) if script else ""
        mb = megabytes(rss, "B")
        if mb:  # MaxRSS is of the biggest task: a node holds about tasks/nodes of them
            mb *= math.ceil(max(number(tasks, 1), 1) / max(number(nodes, 1), 1))
            r["peak_mb"] = max(r["peak_mb"] or 0, mb)
    return [r for r in runs.values() if r.get("state") and r["state"] not in ACTIVE and r.get("elapsed", 0) > 0]


def shlex_words(line):
    try:
        return shlex.split(line)
    except ValueError:
        return line.split()


def sh(argv, timeout=120):
    try:
        p = subprocess.run(argv, stdout=subprocess.PIPE, stderr=subprocess.PIPE, universal_newlines=True,
                           timeout=timeout)
        return p.returncode, p.stdout
    except (OSError, subprocess.SubprocessError):
        return 1, ""


def load(path=None):
    try:
        with open(path or STORE) as f:
            data = json.load(f)
        if isinstance(data.get("kinds"), dict):
            return data
    except (OSError, ValueError, AttributeError):
        pass
    return {"since": 0, "kinds": {}}


def save(data, path=None):
    path = path or STORE
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = "%s.%d" % (path, os.getpid())
    with open(tmp, "w") as f:
        json.dump(data, f, separators=(",", ":"))
    os.replace(tmp, path)


def id_key(job_id):
    return [int(x) for x in re.findall(r"\d+", job_id)]


def merge(data, runs, now):
    kinds = data["kinds"]
    for r in runs:
        got = [x for x in kinds.get(r["kind"], []) if x["id"] != r["id"]] + [r]
        kinds[r["kind"]] = sorted(got, key=lambda x: id_key(x["id"]))[-KEEP_RUNS:]
    for k in sorted(kinds, key=lambda k: id_key(kinds[k][-1]["id"]))[:max(0, len(kinds) - KEEP_KINDS)]:
        del kinds[k]
    data["since"] = int(now)


def mark_whole(runs, run=sh):
    """Whether each run had its nodes to itself (all their cores): then its memory blocked nobody."""
    cores = {}
    for line in run(["sinfo", "-h", "-N", "-o", "%N|%c"])[1].splitlines():
        node, _, c = line.partition("|")
        cores[node.strip()] = number(c)
    for r in runs:
        c = cores.get(r.get("node", ""), 0)
        r["whole"] = bool(c) and r["cpus"] >= c * r["nodes"]


def refresh(data, now=None, run=sh, user=None):
    """Adds the jobs that finished since the last look. False: sacct didn't answer (the history stays)."""
    now = int(now or time.time())
    start = data["since"] - OVERLAP if data.get("since") else now - FIRST_DAYS * 86400
    argv = ["sacct", "-n", "-P", "-u", user or os.environ.get("USER", ""), "-S",
            time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime(start)), "-E", "now", "-o"]
    submit = True
    code, out = run(argv + [FIELDS + ",SubmitLine"])
    if code != 0:  # Slurm before 20.11 has no SubmitLine: runs are known by their name
        submit, (code, out) = False, run(argv + [FIELDS])
    if code != 0:
        return False
    runs = parse_sacct(out, submit)
    if runs:
        mark_whole(runs, run)
    merge(data, runs, now)
    return True
