#!/usr/bin/env bash
# apt-get install on GitHub's Ubuntu runners, sturdy against a slow mirror: some runners get one that sends a small
# package every few seconds, which held a step until its job's time limit. Each try is short; a try that doesn't
# finish moves to another mirror.  Usage: .github/apt-install.sh <package>...
set -u
mirrors=("" "http://azure.archive.ubuntu.com/ubuntu" "http://archive.ubuntu.com/ubuntu")
apt=(sudo apt-get -o Acquire::Retries=2 -o Acquire::http::Timeout=20)
for try in 0 1 2; do
  if [ -n "${mirrors[$try]}" ]; then
    echo "apt: trying ${mirrors[$try]}"
    sudo sed -i -E "s#https?://[A-Za-z0-9.-]*archive\.ubuntu\.com/ubuntu/?#${mirrors[$try]}/#g" \
      /etc/apt/sources.list.d/*.sources /etc/apt/sources.list 2>/dev/null
  fi
  timeout 180 "${apt[@]}" update -q &&
    timeout 360 "${apt[@]}" install -y -q --no-install-recommends "$@" && exit 0
  echo "apt: try $((try + 1)) did not finish"
done
exit 1
