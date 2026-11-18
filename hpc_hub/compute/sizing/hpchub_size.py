#!/usr/bin/env python3
"""hpchub-size: the memory and cores a Slurm job needs, from what its earlier runs really used.

  hpchub-size run.sh [args]        before sbatch, with the words you give sbatch
  hpchub-size --mem=64G run.sh     sbatch options count, as they do for sbatch
  hpchub-size                      the jobs measured lately
  hpchub-size --job 123456         what one finished job used
  add --json for the same as JSON

HPC Hub puts this on the cluster. Every finished job is measured from sacct and kept in ~/.hpc-hub/job-sizes.json;
nothing is sent anywhere. It only advises: submitting is up to you.
"""
import base64
import json
import os
import sys

try:
    from . import size_advise as advise
    from . import size_measure as m
except (ImportError, SystemError):  # on the cluster: the files sit next to each other
    import size_advise as advise
    import size_measure as m


def queue_of(partition, run=m.sh):
    """Cores and memory (MB) of the biggest node in the queue, or in the default one."""
    best, default = {}, ""
    for line in run(["sinfo", "-h", "-o", "%P|%c|%m"])[1].splitlines():
        cells = line.split("|")
        if len(cells) < 3:
            continue
        name = cells[0].strip()
        if name.endswith("*"):
            name = default = name[:-1]
        cores, mem = m.number(cells[1].rstrip("+")), m.number(cells[2].rstrip("+"))
        got = best.setdefault(name, {"cores": 0, "mem_mb": 0})
        got.update(cores=max(got["cores"], cores), mem_mb=max(got["mem_mb"], mem))
    return best.get(partition or default, {})


def show(rep):
    """The report as text for a person or an agent."""
    a, s, runs = rep["asked"], rep["suggest"], rep["runs"]
    out = ["Job: " + rep["kind"]]
    if runs:
        how = {"same": "", "script": " (same script, other arguments)", "name": " (same job name)"}[rep["match"]]
        out += ["Earlier runs%s, newest last:" % how,
                "  %-12s %-14s %10s %16s %22s" % ("job", "state", "time", "cores busy", "memory used")]
        for r in runs:
            busy = "%.1f of %d" % (r["busy"], r["cpus"]) if r["busy"] is not None else "?"
            mem = "%s of %s" % (m.gb(r["peak_mb"]) if r["peak_mb"] else "?",
                                m.gb(r["req_mb"]) if r["req_mb"] else "?")
            out.append("  %-12s %-14s %10s %16s %22s" % (r["id"], ("OUT_OF_MEMORY" if r["oom"] else r["state"])[:14],
                                                        m.clock(r["elapsed"]), busy, mem))
    ask = "%s and %d cores" % (advise.gb_whole(a["mem_mb"]) if a["mem_mb"] else "the queue's default memory",
                               a["cpus"])
    out.append("It asks for %s per node%s." % (ask, ", whole nodes" if rep["whole"] else ""))
    if s:
        flags = (["--mem=%dG" % (s["mem_mb"] // 1024)] if s["mem_mb"] else []) + (
            ["--cpus-per-task=%d" % s["cpus"]] if s["cpus"] and a["cores_fixable"] else []) + (
            ["--time=%s" % m.clock(s["time"])] if s["time"] else [])
        out.append("Suggested: " + (" ".join(flags) or "no measurements yet (accounting may be off)"))
        if s["mem_mb"]:
            out.append("  memory: peak %s x margin %.2g" % (m.gb(s["peak_mb"]), s["margin"]))
        if s["busy"] is not None:
            out.append("  cores: at most %.1f busy on average" % s["busy"])
    for x in rep["advice"]:
        out.append(("Warning: " if x["strict"] else "Note: ") + x["text"])
    return "\n".join(out)


def one_line(r):
    busy = "%.1f of %d cores busy" % (r["busy"], r["cpus"]) if r["busy"] is not None else "%d cores" % r["cpus"]
    mem = "used %s of %s" % (m.gb(r["peak_mb"]) if r["peak_mb"] else "?", m.gb(r["req_mb"]) if r["req_mb"] else "?")
    return "Job %s: %s, ran %s, %s, memory %s" % (r["id"], "OUT_OF_MEMORY" if r["oom"] else r["state"],
                                                 m.clock(r["elapsed"]), busy, mem)


def recent(data):
    kinds = sorted(data["kinds"].items(), key=lambda kv: m.id_key(kv[1][-1]["id"]), reverse=True)[:15]
    if not kinds:
        return "No finished jobs measured yet."
    out = ["Jobs measured lately (peak memory of the newest run, and runs kept):"]
    for kind, runs in kinds:
        peak = runs[-1].get("peak_mb")
        out.append("  %-9s %3d  %s" % (m.gb(peak) if peak else "?", len(runs), kind))
    return "\n".join(out)


def main(argv):
    as_json = "--json" in argv
    words = [w for w in argv if w != "--json"]
    text = None
    if "--text-b64" in words[:-1]:  # the script as HPC Hub's editor has it, maybe not saved yet
        i = words.index("--text-b64")
        text = base64.b64decode(words[i + 1]).decode("utf-8", "replace")
        del words[i:i + 2]
    if words[:1] == ["--job"] and len(words) == 2:
        code, out = m.sh(["sacct", "-n", "-P", "-j", words[1], "-o", m.FIELDS])
        runs = [advise.view(r) for r in m.parse_sacct(out, submit=False, kinds=False)]
        print(json.dumps(runs) if as_json else "\n".join(one_line(r) for r in runs) or "No such finished job.")
        return 0
    data = m.load()
    if m.refresh(data):
        try:
            m.save(data)
        except OSError:
            pass
    if not words:
        print(json.dumps(data["kinds"]) if as_json else recent(data))
        return 0
    opts, script, args = m.split_sbatch(words)
    if text is None and script:
        try:
            with open(os.path.expanduser(script)) as f:
                text = f.read()
        except OSError:
            text = ""
    merged = advise_opts(text, opts)
    rep = advise.report(data["kinds"], merged, script, args, os.getcwd(), queue_of(merged.get("partition", "")))
    print(json.dumps(rep) if as_json else show(rep))
    return 0


def advise_opts(text, opts):
    """The script's #SBATCH options, with the ones given on the command line on top (as sbatch does)."""
    got = m.directives(text or "")
    got.update(opts)
    return got


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
