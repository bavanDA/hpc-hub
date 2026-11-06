"""Your own Globus collection: Globus Connect Personal started on a login node."""

import shlex

# Globus Connect Personal (unpacked in ~) on a login node, sharing home and the given folders. Running already
# with other folders (you joined a group since), or RESTART=1: start it again with these.
START = r"""
gcp=$(ls -d "$HOME"/globusconnectpersonal-*/ 2>/dev/null | sort -V | tail -1)
[ -n "$gcp" ] || { echo "Globus Connect Personal is not installed in your home folder there" >&2; exit 2; }
allow="rw~/"
for p in "$@"; do allow="$allow,rw$p,rw$(readlink -f "$p")"; done
if "$gcp/globusconnectpersonal" -status >/dev/null 2>&1; then
  now=$(ps -u "$USER" -o args= | sed -n 's/.*globusconnectpersonal -start -restrict-paths \([^ ]*\).*/\1/p' | head -1)
  [ "${RESTART:-}" != 1 ] && { [ -z "$now" ] || [ "$now" = "$allow" ]; } && exit 0
  "$gcp/globusconnectpersonal" -stop >/dev/null 2>&1
  for _ in $(seq 10); do "$gcp/globusconnectpersonal" -status >/dev/null 2>&1 || break; sleep 1; done
fi
(cd "$gcp" && exec setsid nohup ./globusconnectpersonal -start -restrict-paths "$allow") >/dev/null 2>&1 </dev/null &
for _ in $(seq 20); do sleep 2; "$gcp/globusconnectpersonal" -status >/dev/null 2>&1 && exit 0; done
echo "Globus Connect Personal started but did not connect to Globus" >&2; exit 1
"""


def start_command(paths: list[str], restart: bool = False) -> str:
    run = ["bash", "-c", shlex.quote(START), "_", *map(shlex.quote, paths)]
    return " ".join(["RESTART=1"] * restart + run)


def denied(err: str) -> bool:
    """A folder your own collection doesn't share (yet)."""
    low = err.lower()
    return "permission denied" in low or "permissiondenied" in low or "not allowed" in low


def offline(err: str) -> bool:
    return "Globus Connect Personal" in err and "not currently connected" in err
