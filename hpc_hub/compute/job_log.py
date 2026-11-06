"""A batch job's log: where it is, following it, and the VS Code tunnel link in it."""

from ..core.ssh import SshMaster


def log_path(job_id: str) -> str:
    """Shell snippet that prints the job's stdout file."""
    return f'scontrol show job -o {int(job_id)} 2>/dev/null | grep -o "StdOut=[^ ]*" | cut -d= -f2-'


def tunnel_link(ssh: SshMaster, job_id: str) -> str:
    """Last vscode.dev tunnel link the VS Code job printed, or ""."""
    cmd = f'f=$({log_path(job_id)}); [ -n "$f" ] && grep -ao "https://vscode.dev/tunnel/[^ ]*" "$f" | tail -1'
    return ssh.run(cmd, timeout=30).stdout.strip()


def follow_log(job_id: str) -> str:
    """Shell line: report the job state until it runs, then stream its log."""
    j = int(job_id)
    return (f'j={j}; s=; while :; do t=$(squeue -h -j $j -o %T 2>/dev/null); '
            f'[ "$t" != "$s" ] && echo "Job $j: ${{t:-finished}}"; s=$t; '
            f'case "$t" in PENDING|CONFIGURING) sleep 3;; *) break;; esac; done; '
            f'f=$({log_path(job_id)}); '
            f'[ -n "$f" ] && exec tail -n +1 -F "$f"; echo "No log found for job $j"; exec bash -l')
