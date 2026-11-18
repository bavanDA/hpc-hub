"""What a Slurm job should ask for, from what its earlier runs used (part of hpchub-size). Only advice: the job is
submitted either way, and hard limits are the cluster admins' job. Wording is strict only for jobs that share a
node, where memory and cores asked for and not used keep other jobs waiting.

Runs on the cluster's own python3, which may be 3.6.
"""
import math
import os

try:
    from . import size_measure as m
except (ImportError, SystemError):  # on the cluster, next to hpchub-size
    import size_measure as m

LOOK_BACK = 10  # the newest runs that count
MARGIN, MOST_MARGIN = 1.2, 2.0
OVER, OVER_MB = 1.5, 4096  # asking for 1.5 times what it needs, and 4 GB more, is worth a word
FIRST_RUN = ("No earlier runs of this job. Ask for a modest amount (for example 4 cores and 8 GB) and a short time "
             "limit, then check again after it ends. The program's own dry run (for example --plan-only) counts.")


def asks(opts):
    """What sbatch options ask for on each node: memory in MB (None: the queue's default), cores and more."""
    nodes = max(m.number(str(opts.get("nodes", "1")).split("-")[0], 1), 1)
    tasks = m.number(str(opts.get("ntasks-per-node"))) or -(-max(m.number(str(opts.get("ntasks")), 1), 1) // nodes)
    cpus = max(m.number(str(opts.get("cpus-per-task")), 1), 1) * max(tasks, 1)
    mem = m.megabytes(opts["mem"]) if "mem" in opts else None
    if mem is None and "mem-per-cpu" in opts:
        each = m.megabytes(opts["mem-per-cpu"])
        mem = each * cpus if each is not None else None
    return {"mem_mb": mem, "cpus": cpus, "nodes": nodes, "partition": opts.get("partition", ""),
            "exclusive": "exclusive" in opts, "name": opts.get("job-name", ""), "cores_fixable": tasks <= 1,
            "mem_from": "script" if mem is not None else ""}


def history(kinds, kind, script, name):
    """Runs of the same job, newest last, and how sure: same (script and arguments), script (other arguments),
    name (Slurm too old to say the script) or none."""
    if kinds.get(kind):
        return "same", kinds[kind]
    runs = [r for rs in kinds.values() for r in rs if script and r.get("script") == script]
    if runs:
        return "script", sorted(runs, key=lambda r: m.id_key(r["id"]))
    if name and kinds.get("name: " + name):
        return "name", kinds["name: " + name]
    return "none", []


def suggest(runs):
    """Memory: the peak of the runs times a margin, 1.2 when runs use the same, more when they vary or one ran out.
    Cores: how many were busy at most, plus a fifth. Time: the longest finished run and half again."""
    runs = runs[-LOOK_BACK:]
    last = runs[-1]
    out = {"peak_mb": None, "mem_mb": None, "margin": None, "busy": None, "cpus": None, "longest": None,
           "time": None, "oom": bool(last.get("oom")), "oom_at_mb": None,
           "timeout": any(r.get("state") == "TIMEOUT" for r in runs)}
    peaks = sorted(r["peak_mb"] for r in runs if r.get("peak_mb"))
    if peaks:
        peak, middle = peaks[-1], peaks[(len(peaks) - 1) // 2]
        margin = MARGIN + (peak / middle - 1) + (0.3 if any(r.get("oom") for r in runs) else 0)
        base = peak
        if out["oom"]:  # it stopped at its limit, so it needed more than it got
            base = out["oom_at_mb"] = max(peak, last.get("req_mb") or 0)
        mem = max(base * min(margin, MOST_MARGIN), base + 1024)
        out.update(peak_mb=peak, margin=round(min(margin, MOST_MARGIN), 2), mem_mb=math.ceil(mem / 1024) * 1024)
    busy = [r["cpu_s"] / r["elapsed"] for r in runs if r.get("elapsed", 0) >= 60 and r.get("cpu_s")]
    if busy:
        had = max(r.get("cpus") or 1 for r in runs)
        out.update(busy=round(max(busy), 1), cpus=max(1, min(had, math.ceil(max(busy) * 1.2))))
    done = [r["elapsed"] for r in runs if r.get("state") == "COMPLETED"]
    if done:
        out.update(longest=max(done), time=max(900, math.ceil(max(done) * 1.5 / 600) * 600))
    return out


def _runs(n):
    return "its last run" if n == 1 else "its last %d runs" % n


def advice(a, s, whole, n):
    """What to say about the job as it asks now (a), given the suggestion (s) from n runs. Each may carry a fix."""
    out = []
    ask, want, peak = a.get("mem_mb"), s["mem_mb"], s["peak_mb"]
    mem_fix = {"mem_gb": int(want // 1024)} if want else None
    use = "Use %s" % gb_whole(want) if want else ""
    if want and s["oom"]:
        out.append({"kind": "oom", "strict": False, "fix": mem_fix, "label": use,
                    "text": "The last run ran out of memory at %s. Ask for %s." % (m.gb(s["oom_at_mb"]),
                                                                                  gb_whole(want))})
    elif want and ask and ask >= want * OVER and ask - want >= OVER_MB:
        if whole:
            text = "Asks for %s and used at most %s. It has whole nodes, so this blocks nobody." % (
                gb_whole(ask), m.gb(peak))
        else:
            text = ("Asks for %s, but used at most %s in %s. The rest sits unused while other jobs wait for it. "
                    "Ask for %s." % (gb_whole(ask), m.gb(peak), _runs(n), gb_whole(want)))
        out.append({"kind": "memory", "strict": not whole, "fix": mem_fix, "label": use, "text": text})
    elif want and ask and peak and ask < peak * 1.1 and want > ask:
        out.append({"kind": "tight", "strict": False, "fix": mem_fix, "label": use,
                    "text": "Used %s of %s, close to the limit. Ask for %s." % (m.gb(peak), gb_whole(ask),
                                                                                gb_whole(want))})
    cores, busy = a.get("cpus") or 1, s["busy"]
    if not whole and s["cpus"] and cores >= 2 and s["cpus"] <= cores / 2:
        fix = {"cpus": s["cpus"]} if a.get("cores_fixable") else None
        out.append({"kind": "cores", "strict": True, "fix": fix, "label": "Use %d cores" % s["cpus"] if fix else "",
                    "text": "Asks for %d cores, but at most %.1f were busy on average. Ask for %d." % (
                        cores, busy, s["cpus"])})
    if s["timeout"]:
        out.append({"kind": "time", "strict": False, "fix": None, "label": "",
                    "text": "A recent run stopped at its time limit."})
    return out


def gb_whole(mb):
    return "%d GB" % math.ceil(mb / 1024 - 0.01) if mb >= 1024 else m.gb(mb)


def view(r):
    busy = r["cpu_s"] / r["elapsed"] if r.get("elapsed") and r.get("cpu_s") else None
    return {"id": r["id"], "state": r.get("state", ""), "oom": bool(r.get("oom")), "elapsed": int(r.get("elapsed", 0)),
            "cpus": r.get("cpus", 0), "busy": round(busy, 1) if busy is not None else None,
            "req_mb": r.get("req_mb"), "peak_mb": r.get("peak_mb"), "whole": bool(r.get("whole"))}


def report(kinds, opts, script, args, cwd, queue):
    """Everything hpchub-size says about one job: its runs, what it asks for, the suggestion and the advice.
    queue: the cores and memory (MB) of a node in the job's queue, as far as sinfo says."""
    a = asks(opts)
    name = a["name"] or os.path.basename(script)
    kind = m.kind_of(script, args, cwd, opts.get("wrap", ""), name)
    match, runs = history(kinds, kind, m.script_path(script, cwd) if script else "", name)
    runs = runs[-LOOK_BACK:]
    if a["mem_mb"] == 0 and queue.get("mem_mb"):  # --mem=0: all of the node's memory
        a["mem_mb"] = queue["mem_mb"]
    if a["mem_mb"] is None and runs and runs[-1].get("req_mb"):
        a["mem_mb"], a["mem_from"] = runs[-1]["req_mb"], "last run"
    whole = a["exclusive"] or (bool(queue.get("cores")) and a["cpus"] >= queue["cores"])
    s = suggest(runs) if runs else None
    said = advice(a, s, whole, len(runs)) if s else [{"kind": "new", "strict": False, "fix": None, "label": "",
                                                      "text": FIRST_RUN}]
    return {"kind": kind, "match": match, "runs": [view(r) for r in runs], "asked": a, "whole": whole,
            "suggest": s, "advice": said}
