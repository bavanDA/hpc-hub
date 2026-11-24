#!/usr/bin/env bash
# apt-get install on GitHub's Ubuntu runners, sturdy against a slow mirror: some runners get one that sends a small
# package every few seconds, which held a step until its job's time limit. Each try is short; a try that doesn't
# finish moves to another mirror (packages a try finished stay in apt's cache, so the next one doesn't fetch them
# again).  Usage: .github/apt-install.sh <package>...
#
# APT_SAVE: a folder actions/cache keeps between runs. The packages of the last install that worked are installed
# from it first, without the network; when they no longer fit the runner's image (an update there), apt downloads
# as above and the folder gets this run's packages. On 2026-11-24 all three mirrors were too slow twice in a row.
set -u
save=${APT_SAVE:-}
save=${save/#\~/$HOME}  # "~/apt-save" from a workflow's env
if [ -n "$save" ] && compgen -G "$save/*.deb" >/dev/null; then
  echo "apt: installing the $(ls "$save"/*.deb | wc -l) packages an earlier run saved"
  # (not --no-download: apt then refuses local files, "Pathname to install is not absolute")
  if timeout 240 sudo apt-get -o Acquire::http::Timeout=10 install -y -q --no-install-recommends "$save"/*.deb &&
    dpkg -s "$@" >/dev/null 2>&1; then
    exit 0
  fi
  echo "apt: the saved packages don't fit this runner; downloading"
fi
# another network too (Fastly), in case all of Canonical's are slow from this runner
mirrors=("" "http://mirrors.edge.kernel.org/ubuntu" "http://azure.archive.ubuntu.com/ubuntu" "http://archive.ubuntu.com/ubuntu")
apt=(sudo apt-get -o Acquire::Retries=2 -o Acquire::http::Timeout=20 -o APT::Keep-Downloaded-Packages=true)
for try in 0 1 2 3; do
  if [ -n "${mirrors[$try]}" ]; then
    echo "apt: trying ${mirrors[$try]}"
    sudo sed -i -E "s#https?://([A-Za-z0-9.-]*archive\.ubuntu\.com|mirrors\.edge\.kernel\.org)/ubuntu/?#${mirrors[$try]}/#g" \
      /etc/apt/sources.list.d/*.sources /etc/apt/sources.list 2>/dev/null
  fi
  if timeout 180 "${apt[@]}" update -q && timeout 360 "${apt[@]}" install -y -q --no-install-recommends "$@"; then
    if [ -n "$save" ] && compgen -G "/var/cache/apt/archives/*.deb" >/dev/null; then
      mkdir -p "$save" && rm -f "$save"/*.deb && cp /var/cache/apt/archives/*.deb "$save"/ &&
        echo "apt: saved $(ls "$save"/*.deb | wc -l) packages for the next run"
    fi
    exit 0
  fi
  echo "apt: try $((try + 1)) did not finish"
done
exit 1
