"""This computer's SSH key: find it, make one without ssh-keygen (Windows too), and check that a cluster takes it.
A key is never overwritten. No passphrase: the file is 0600, the cluster still asks for Duo, and a passphrase
would need an agent on every login."""

import getpass
import os
import re
import socket
import subprocess
import time
from dataclasses import asdict, dataclass, replace
from pathlib import Path

from . import login_copy as C

NAMES = ("id_ed25519", "id_ecdsa", "id_rsa")  # the ones ssh tries by itself, best first


@dataclass
class MyKey:
    path: str  # the private key
    kind: str  # ed25519, ecdsa, rsa
    public: str  # the line to paste on the key page
    made: float  # unix time of the file

    @property
    def file(self) -> str:
        """"id_ed25519"."""
        return Path(self.path).name

    def json(self) -> dict:
        return {**asdict(self), "file": self.file,
                "made_on": time.strftime("%b %Y", time.localtime(self.made))}  # "Oct 2026"


def ssh_dir() -> Path:
    return Path.home() / ".ssh"


NOT_KEYS = {"known_hosts", "known_hosts.old", "authorized_keys", "config", "environment"}


def _kind(public: str) -> str:
    """"ed25519" for "ssh-ed25519 AAAA...", "ecdsa" for "ecdsa-sha2-nistp256 ...", "rsa" for "ssh-rsa ..."."""
    t = public.split(" ", 1)[0]
    return "ed25519" if "ed25519" in t else "ecdsa" if t.startswith("ecdsa") else "rsa" if "rsa" in t else t


def load(path: str | Path) -> MyKey:
    """A private key you picked yourself. Its public half comes from the .pub next to it, or from the key itself
    when it has no passphrase. ValueError with a plain reason otherwise."""
    key = Path(path).expanduser()
    if key.suffix == ".pub":  # picked the public half: the private one sits next to it
        key = key.with_suffix("")
    if not key.is_file():
        raise ValueError(f"Can't find the private key {key.name}")
    pub = key.with_name(key.name + ".pub")
    line = pub.read_text(errors="replace").strip() if pub.is_file() else ""
    if not line:
        from cryptography.hazmat.primitives import serialization as s
        try:
            private = s.load_ssh_private_key(key.read_bytes(), password=None)
        except TypeError as e:
            raise ValueError(f"{key.name} has a passphrase. Put {key.name}.pub next to it and pick it again.") from e
        except ValueError as e:
            raise ValueError(f"{key.name} isn't an SSH private key") from e
        line = private.public_key().public_bytes(s.Encoding.OpenSSH, s.PublicFormat.OpenSSH).decode()
    return MyKey(str(key), _kind(line), line, key.stat().st_mtime)


def find(chosen: str = "") -> MyKey | None:
    """The key to use: the one you picked, else the first one ssh tries by itself, else any other key in ~/.ssh
    with both halves (Ed25519 first)."""
    if chosen:
        try:
            return load(chosen)
        except (ValueError, OSError):
            pass
    for name in NAMES:
        key, pub = ssh_dir() / name, ssh_dir() / f"{name}.pub"
        if key.exists() and pub.exists():
            line = pub.read_text(errors="replace").strip()
            if line:
                return MyKey(str(key), name.removeprefix("id_"), line, key.stat().st_mtime)
    others = []
    try:
        pubs = sorted(ssh_dir().glob("*.pub"))
    except OSError:
        pubs = []
    for pub in pubs:
        key = pub.with_suffix("")
        if key.name in NOT_KEYS or not key.is_file():
            continue
        line = pub.read_text(errors="replace").strip()
        if line:
            others.append(MyKey(str(key), _kind(line), line, key.stat().st_mtime))
    others.sort(key=lambda k: k.kind != "ed25519")
    return others[0] if others else None


def comment() -> str:
    try:
        user = getpass.getuser()
    except (KeyError, OSError):
        user = "me"
    return f"{user}@{socket.gethostname().split('.')[0]} (HPC Hub)"


def create() -> MyKey:
    """An Ed25519 key in ~/.ssh/id_ed25519. FileExistsError if one is there: yours is never replaced."""
    from cryptography.hazmat.primitives import serialization as s
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

    folder = ssh_dir()
    folder.mkdir(mode=0o700, exist_ok=True)
    key, pub = folder / "id_ed25519", folder / "id_ed25519.pub"
    if pub.exists():
        raise FileExistsError(f"{pub} is there already")
    made = Ed25519PrivateKey.generate()
    fd = os.open(key, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)  # fails if a private key is there
    with os.fdopen(fd, "wb") as f:
        f.write(made.private_bytes(s.Encoding.PEM, s.PrivateFormat.OpenSSH, s.NoEncryption()))
    line = made.public_key().public_bytes(s.Encoding.OpenSSH, s.PublicFormat.OpenSSH).decode() + " " + comment()
    pub.write_text(line + "\n")
    return MyKey(str(key), "ed25519", line, key.stat().st_mtime)


def adopt(path: str | Path) -> Path:
    """A private key picked from a temporary copy (the phone's file picker), kept in ~/.ssh: only a real key, 0600,
    never over another file. The temporary copy goes."""
    source = Path(path).expanduser()
    load(source)  # not a key: ValueError with the reason
    folder = ssh_dir()
    folder.mkdir(mode=0o700, exist_ok=True)
    target, n = folder / source.name, 1
    while target.exists() or target.with_name(target.name + ".pub").exists():
        target, n = folder / f"{source.name}-{n}", n + 1
    fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "wb") as f:
        f.write(source.read_bytes())
    source.unlink(missing_ok=True)
    return target


def test_argv(key: MyKey, user: str, host: str, port: int = 22) -> list[str]:
    """ssh with only this key and no prompts, verbose so the answer says how far the login got."""
    return ["ssh", "-v", "-o", "BatchMode=yes", "-o", "IdentitiesOnly=yes", "-i", key.path,
            "-o", "ControlMaster=no", "-o", "ControlPath=none", "-o", "ConnectTimeout=15",
            "-o", "StrictHostKeyChecking=accept-new", "-o", "PreferredAuthentications=publickey",
            "-p", str(port), "-l", user, "--", host, "true"]


@dataclass
class Result:
    reason: str  # a key of login_copy.TEST: ok, not_yet, no_vpn, unreachable, host_key, unfinished, no_ssh
    who: str = ""  # "Yale", for the sentence
    last: str = ""  # ssh's last words, for "unfinished"

    @property
    def ok(self) -> bool:
        return self.reason == "ok"

    @property
    def kind(self) -> str:
        """"ok", "wait" (the key isn't known yet) or "error": the banner's color."""
        return "ok" if self.ok else "wait" if self.reason == "not_yet" else "error"

    @property
    def text(self) -> str:
        return C.TEST[self.reason].format(who=self.who, last=self.last).strip()

    def json(self) -> dict:
        return {"ok": self.ok, "text": self.text, "kind": self.kind, "reason": self.reason, "last": self.last}


UNREACHABLE = re.compile(r"Could not resolve hostname|Connection timed out|No route to host|Network is unreachable|"
                         r"Connection refused|Operation timed out|connect to host .* port \d+:")


def verdict(output: str, code: int, who: str, vpn: bool = False) -> Result:
    """What ssh -v said, as a reason. who: "Yale"; vpn: the cluster sits behind a VPN."""
    if code == 0 or re.search(r'Authenticated using "publickey" with partial success|Partial publickey|'
                              r'Authenticated to .* using "publickey"|Authentication succeeded \(publickey\)', output):
        return Result("ok", who)  # partial success: the key is in, Duo comes next
    if UNREACHABLE.search(output):
        return Result("no_vpn" if vpn else "unreachable", who)
    if "Host key verification failed" in output or "REMOTE HOST IDENTIFICATION HAS CHANGED" in output:
        return Result("host_key", who)
    if "Permission denied" in output:
        return Result("not_yet", who)
    last = next((line for line in reversed(output.splitlines()) if line and not line.startswith("debug")), "")
    return Result("unfinished", who, last)


def test(key: MyKey, user: str, host: str, port: int, who: str, vpn: bool = False) -> Result:
    try:
        p = subprocess.run(test_argv(key, user, host, port), capture_output=True, text=True, timeout=40,
                           stdin=subprocess.DEVNULL)
    except FileNotFoundError:
        return Result("no_ssh", who)
    except subprocess.TimeoutExpired:
        return verdict("Connection timed out", 255, who, vpn)
    return verdict(p.stderr, p.returncode, who, vpn)


SECOND_STEP = re.compile(r"duo|passcode|one[- ]?time|verification code", re.I)  # asked after the key is taken


def test_asyncssh(key: MyKey, user: str, cfg) -> Result:
    """The same check where there is no ssh program (the phone), through asyncssh. Nothing asked is answered: a
    cluster that goes on to its second step (Duo) has taken the key."""
    try:
        from . import ssh_async
    except ImportError:
        return Result("no_ssh", cfg.who)
    asked: list[str] = []

    def ask(prompt: str) -> None:
        asked.append(prompt)
    master = ssh_async.AsyncSshMaster(replace(cfg, ssh_key=key.path), user, {}, lambda _: None, ask)
    try:
        master.start(timeout=30)
    except ssh_async.SshError as e:
        if SECOND_STEP.search(" ".join(asked)):
            return Result("ok", cfg.who)
        return verdict(str(e).replace("SSH login timed out", "Connection timed out"), 255, cfg.who, cfg.vpn.enabled)
    master.stop()
    return Result("ok", cfg.who)
