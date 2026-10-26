"""The VPN wrappers in packaging/vpn (docs/design/vpn-helper.md): HPCHUB_ROUTES and HPCHUB_DOMAINS become the
CISCO_* variables vpnc-script reads. The sh one runs here with a fake vpnc-script that dumps its environment;
the JScript one needs cscript, so only its route and domain parts run, under node."""

import ipaddress
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

VPN = Path(__file__).resolve().parents[2] / "packaging" / "vpn"
SHELLS = [s for s in (["sh"], ["bash", "--posix"], ["dash"], ["busybox", "sh"]) if shutil.which(s[0])]
NODE = shutil.which("node")
posix_only = pytest.mark.skipif(sys.platform == "win32" or not SHELLS, reason="needs a POSIX sh")
needs_node = pytest.mark.skipif(not NODE, reason="needs node")

FAKE_SCRIPT = """#!/bin/sh
env > "$HPCHUB_TEST_DUMP"
echo "args:$*" >> "$HPCHUB_TEST_DUMP"
exit "${FAKE_EXIT:-0}"
"""

EXAMPLE = {
    "routes": " 10.1.2.3/8  192.168.4.0/22\t2001:db8::/32 128.235.1.1 ",
    "domains": "njit.edu  cs.njit.edu",
}
EXAMPLE_VARS = {
    "CISCO_SPLIT_INC": "3",
    "CISCO_SPLIT_INC_0_ADDR": "10.0.0.0", "CISCO_SPLIT_INC_0_MASK": "255.0.0.0", "CISCO_SPLIT_INC_0_MASKLEN": "8",
    "CISCO_SPLIT_INC_1_ADDR": "192.168.4.0", "CISCO_SPLIT_INC_1_MASK": "255.255.252.0",
    "CISCO_SPLIT_INC_1_MASKLEN": "22",
    "CISCO_SPLIT_INC_2_ADDR": "128.235.1.1", "CISCO_SPLIT_INC_2_MASK": "255.255.255.255",
    "CISCO_SPLIT_INC_2_MASKLEN": "32",
    "CISCO_IPV6_SPLIT_INC": "1",
    "CISCO_IPV6_SPLIT_INC_0_ADDR": "2001:db8::", "CISCO_IPV6_SPLIT_INC_0_MASKLEN": "32",
    "CISCO_SPLIT_DNS": "njit.edu,cs.njit.edu",
}
BAD_ROUTES = ["10.0.0.0/33", "10.0.0/8", "256.1.1.1/8", "010.0.0.0/8", "10.0.0.0/", "10.0.0.0/08",
              "1.2.3.4/8/9", "1.2.3.4/x", "*", "fe80::/129", "fe80::zz/64", "10.0.0.0;reboot"]
BAD_DOMAINS = ["a;b", "$(id)", "x/y", "*"]


def all_lengths():
    """One route per prefix length, with host bits, and what each should become."""
    routes, want = [], {}
    for n in range(33):
        net = ipaddress.ip_network(f"172.20.30.40/{n}", strict=False)
        routes.append(f"172.20.30.40/{n}")
        want.update({f"CISCO_SPLIT_INC_{n}_ADDR": str(net.network_address),
                     f"CISCO_SPLIT_INC_{n}_MASK": str(net.netmask), f"CISCO_SPLIT_INC_{n}_MASKLEN": str(n)})
    return " ".join(routes), want


def cisco(env: dict) -> dict:
    return {k: v for k, v in env.items() if k.startswith("CISCO_")}


# -- hpchub-script.sh -------------------------------------------------------------------------------------

@pytest.fixture(params=SHELLS, ids=[" ".join(s) for s in SHELLS])
def run_sh(request, tmp_path):
    shell = request.param
    shutil.copy(VPN / "hpchub-script.sh", tmp_path / "hpchub-script.sh")
    (tmp_path / "vpnc-script").write_text(FAKE_SCRIPT)
    dump = tmp_path / "env.txt"

    def run(routes=None, domains=None, *args, **extra):
        env = {"PATH": os.environ["PATH"], "HPCHUB_TEST_DUMP": str(dump), "reason": "connect", **extra}
        if routes is not None:
            env["HPCHUB_ROUTES"] = routes
        if domains is not None:
            env["HPCHUB_DOMAINS"] = domains
        dump.unlink(missing_ok=True)
        proc = subprocess.run([*shell, str(tmp_path / "hpchub-script.sh"), *args], env=env, capture_output=True,
                              text=True, timeout=30)
        seen = None
        if dump.exists():
            lines = dump.read_text().splitlines()
            seen = dict(line.split("=", 1) for line in lines if "=" in line and not line.startswith("args:"))
            seen["args:"] = next(line[5:] for line in lines if line.startswith("args:"))
        return proc, seen

    return run


@posix_only
def test_sh_routes_and_domains(run_sh):
    proc, seen = run_sh(EXAMPLE["routes"], EXAMPLE["domains"])
    assert proc.returncode == 0, proc.stderr
    assert cisco(seen) == EXAMPLE_VARS
    assert seen["reason"] == "connect"


@posix_only
def test_sh_every_prefix_length(run_sh):
    routes, want = all_lengths()
    proc, seen = run_sh(routes)
    assert proc.returncode == 0, proc.stderr
    assert cisco(seen) == {**want, "CISCO_SPLIT_INC": "33", "CISCO_IPV6_SPLIT_INC": "0"}


@posix_only
def test_sh_ipv6_only_still_counts_ipv4(run_sh):
    proc, seen = run_sh("fd00::/8 2001:db8::1")
    assert proc.returncode == 0, proc.stderr
    assert cisco(seen) == {"CISCO_SPLIT_INC": "0", "CISCO_IPV6_SPLIT_INC": "2",
                           "CISCO_IPV6_SPLIT_INC_0_ADDR": "fd00::", "CISCO_IPV6_SPLIT_INC_0_MASKLEN": "8",
                           "CISCO_IPV6_SPLIT_INC_1_ADDR": "2001:db8::1", "CISCO_IPV6_SPLIT_INC_1_MASKLEN": "128"}


@posix_only
@pytest.mark.parametrize("routes", [None, "", "  \t "])
def test_sh_no_routes_keeps_the_servers(run_sh, routes):
    server = {"CISCO_SPLIT_INC": "1", "CISCO_SPLIT_INC_0_ADDR": "10.0.0.0", "CISCO_SPLIT_INC_0_MASK": "255.0.0.0",
              "CISCO_SPLIT_INC_0_MASKLEN": "8", "CISCO_SPLIT_DNS": "example.org"}
    proc, seen = run_sh(routes, None, **server)
    assert proc.returncode == 0, proc.stderr
    assert cisco(seen) == server


@posix_only
def test_sh_domains_without_routes(run_sh):
    proc, seen = run_sh("", " njit.edu ")
    assert proc.returncode == 0, proc.stderr
    assert cisco(seen) == {"CISCO_SPLIT_DNS": "njit.edu"}


@posix_only
def test_sh_passes_arguments_and_exit_code(run_sh):
    proc, seen = run_sh("10.0.0.0/8", "", "one", "two words", FAKE_EXIT="3")
    assert proc.returncode == 3
    assert seen["args:"] == "one two words"


@posix_only
@pytest.mark.parametrize("routes,domains", [*((r, "") for r in BAD_ROUTES), *(("10.0.0.0/8", d) for d in BAD_DOMAINS)])
def test_sh_refuses_bad_input(run_sh, routes, domains):
    proc, seen = run_sh(f"10.0.0.0/8 {routes}", domains)
    assert proc.returncode == 2
    assert seen is None  # the real script never ran
    assert "hpchub-script:" in proc.stderr


# -- hpchub-script.js (JScript; its pure parts under node) ------------------------------------------------

def split_vars_js(cases: list[tuple[str, str]]) -> list[dict]:
    code = """
const h = require(process.argv[1]);
const cases = JSON.parse(require("fs").readFileSync(0, "utf8"));
console.log(JSON.stringify(cases.map(([r, d]) => {
    try { return {vars: Object.fromEntries(h.splitVars(r, d))}; } catch (e) { return {error: e.message}; }
})));
"""
    out = subprocess.run([NODE, "-e", code, str(VPN / "hpchub-script.js")], input=json.dumps(cases),
                         capture_output=True, text=True, timeout=30, check=True).stdout
    return json.loads(out)


@needs_node
def test_js_routes_and_domains():
    routes, want = all_lengths()
    example, lengths, nothing, dns_only = split_vars_js(
        [(EXAMPLE["routes"], EXAMPLE["domains"]), (routes, ""), (" ", ""), ("", "njit.edu")])
    assert example == {"vars": EXAMPLE_VARS}
    assert lengths == {"vars": {**want, "CISCO_SPLIT_INC": "33", "CISCO_IPV6_SPLIT_INC": "0"}}
    assert nothing == {"vars": {}}
    assert dns_only == {"vars": {"CISCO_SPLIT_DNS": "njit.edu"}}


@needs_node
def test_js_refuses_bad_input():
    cases = [*((f"10.0.0.0/8 {r}", "") for r in BAD_ROUTES), *(("10.0.0.0/8", d) for d in BAD_DOMAINS)]
    for case, result in zip(cases, split_vars_js(cases)):
        assert "error" in result, case


def test_js_is_plain_jscript():
    """cscript's JScript is ECMAScript 3: none of the newer syntax or methods."""
    code = re.sub(r"//.*", "", (VPN / "hpchub-script.js").read_text())
    for pattern in (r"\blet\b", r"\bconst\b", "=>", "`", r"\.trim\(", r"\.forEach\(", r"\.map\(", r"\.filter\(",
                    r"Array\.isArray", r"Object\.keys", r"JSON\."):
        assert not re.search(pattern, code), pattern
