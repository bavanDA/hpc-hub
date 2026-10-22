#!/usr/bin/env python3
"""remote-lock: Claude Code takes no prompts until you send a code from your authenticator app.

If someone gets into your Claude account, Remote Control lets them type into Claude on your machine.
With remote-lock they need the 6-digit code from your phone too.

  remote-lock setup            set up for you (sudo: for the whole machine, Claude can't turn it off)
  remote-lock setup --stdin    same, with a secret made by another app (one base32 line on stdin)
  remote-lock status [--json]  what is set, and what happened lately
  remote-lock set minutes=10   minutes a code keeps a session open (0 = a code with every message)
  remote-lock set tries=3      wrong codes before Claude is stopped and locked
  remote-lock set logout=on    also sign Claude out after too many wrong codes
  remote-lock set scancel=on   also cancel the Slurm job Claude runs in
  remote-lock lock             close every open session now
  remote-lock reset            unlock after too many wrong codes
  remote-lock uninstall        remove it
"""
import base64
import hashlib
import hmac
import json
import os
import shlex
import shutil
import socket
import struct
import subprocess
import sys
import time
import urllib.parse

VERSION = "0.1.0"
SYSTEM_DIR = "/var/lib/remote-lock"
SYSTEM_BIN = "/usr/local/bin/remote-lock"
SUDOERS = "/etc/sudoers.d/remote-lock"
MANAGED = ("/Library/Application Support/ClaudeCode/managed-settings.json" if sys.platform == "darwin"
           else "/etc/claude-code/managed-settings.json")
DEFAULTS = {"minutes": 10, "tries": 3, "logout": True, "scancel": True}
REMOTE_FLAGS = {"--remote-control", "--rc"}


def system():
    return os.geteuid() == 0


def store_dir():
    return SYSTEM_DIR if system() else os.path.expanduser("~/.config/remote-lock")


def settings_path():
    return MANAGED if system() else os.path.expanduser("~/.claude/settings.json")


def bin_path():
    return SYSTEM_BIN if system() else os.path.expanduser("~/.local/bin/remote-lock")


class Store:
    """The secret, config, state and log, in a folder only its owner can read."""

    def __init__(self, folder):
        self.dir = folder

    def read(self, name, default):
        try:
            with open(os.path.join(self.dir, name)) as f:
                return json.load(f) if name.endswith(".json") else f.read().strip()
        except (OSError, ValueError):
            return default

    def write(self, name, data):
        os.makedirs(self.dir, mode=0o700, exist_ok=True)
        path = os.path.join(self.dir, name)
        fd = os.open(path + ".new", os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w") as f:
            f.write(data if isinstance(data, str) else json.dumps(data))
        os.replace(path + ".new", path)

    def config(self):
        conf = dict(DEFAULTS)
        conf.update(self.read("config.json", {}))
        return conf

    def log(self, line):
        os.makedirs(self.dir, mode=0o700, exist_ok=True)
        with open(os.path.join(self.dir, "log"), "a") as f:
            f.write(time.strftime("%Y-%m-%d %H:%M:%S ") + line + "\n")


# -- codes (TOTP, RFC 6238: what Google Authenticator and others use) ----------------------------------------
def new_secret():
    return base64.b32encode(os.urandom(20)).decode()


def code_at(secret, step):
    key = base64.b32decode(secret.upper() + "=" * (-len(secret) % 8))
    mac = hmac.new(key, struct.pack(">Q", step), hashlib.sha1).digest()
    n = struct.unpack(">I", mac[mac[-1] & 15:][:4])[0] & 0x7FFFFFFF
    return "%06d" % (n % 1000000)


def code_ok(secret, code, now):
    step = int(now // 30)
    return any(hmac.compare_digest(code_at(secret, step + d), code) for d in (-1, 0, 1))


# -- the check ------------------------------------------------------------------------------------------------
def check(store, session, prompt, now=None):
    """{"allow": bool, "reason": str, "lockdown": {...} when Claude should be stopped}."""
    now = time.time() if now is None else now
    secret, conf = store.read("secret", ""), store.config()
    if not secret:
        return {"allow": False, "reason": "remote-lock is not set up. Run: remote-lock setup"}
    minutes, tries = int(conf["minutes"]), int(conf["tries"])
    state = store.read("state.json", {})
    state["open"] = {k: v for k, v in state.get("open", {}).items() if v > now}
    if state.get("fails", 0) >= tries:
        return {"allow": False, "reason": "Locked after too many wrong codes. Run `remote-lock reset` on the machine."}
    if state["open"].get(session, 0) > now:
        return {"allow": True}
    words = prompt.split(None, 1)
    code = words[0] if words else ""
    each = minutes <= 0
    if not (len(code) == 6 and code.isdigit()):
        how = "" if each else ", and this session stays open for %d minutes" % minutes
        return {"allow": False, "reason": "Locked. Start your message with the code from your authenticator app%s. "
                                          "Like: 123456 your message" % how}
    if code not in state.get("used", []) and code_ok(secret, code, now):
        state["fails"] = 0
        state["used"] = (state.get("used", []) + [code])[-3:]  # a code works once
        if not each:
            state["open"][session] = now + minutes * 60
        store.write("state.json", state)
        store.log("ok %s" % session + ("" if each else " (open %d min)" % minutes))
        if len(words) > 1:
            return {"allow": True}
        return {"allow": False, "reason": "Code OK. Send your message with a new code." if each else
                "Unlocked for %d minutes. Send your message." % minutes}
    state["fails"] = state.get("fails", 0) + 1
    store.log("wrong code %d of %d in %s" % (state["fails"], tries, session))
    if state["fails"] < tries:
        store.write("state.json", state)
        return {"allow": False, "reason": "Wrong or used code. %d tries left." % (tries - state["fails"])}
    state["open"] = {}
    store.write("state.json", state)
    store.log("locked: stopping Claude")
    return {"allow": False, "reason": "Wrong code too many times. Claude is stopping and stays locked.",
            "lockdown": {"logout": bool(conf["logout"]), "scancel": bool(conf["scancel"])}}


# -- the Claude Code hook -------------------------------------------------------------------------------------
def claude_process():
    """(pid, argv) of the Claude that runs this hook, or (0, [])."""
    pid = os.getppid()
    while pid > 1:
        try:
            with open("/proc/%d/cmdline" % pid, "rb") as f:
                argv = [a.decode("utf-8", "replace") for a in f.read().split(b"\0") if a]
            with open("/proc/%d/stat" % pid) as f:
                ppid = int(f.read().rsplit(")", 1)[1].split()[1])
        except (OSError, ValueError, IndexError):
            return 0, []
        if argv and (os.path.basename(argv[0]) == "claude" or any(a.endswith("claude-code/cli.js") for a in argv)):
            return pid, argv
        pid = ppid
    return 0, []


def lock_down(opts, pid, argv):
    if not pid:
        return
    claude = argv[0] if os.path.basename(argv[0]) == "claude" else "claude"
    steps = []
    if opts.get("logout"):
        steps.append(shlex.quote(claude) + " auth logout")
    job = os.environ.get("SLURM_JOB_ID", "")
    if opts.get("scancel") and job.isdigit():
        steps.append("scancel " + job)
    steps.append("kill %d" % pid)
    subprocess.Popen(["sh", "-c", "sleep 1; " + "; ".join(steps)], stdin=subprocess.DEVNULL,
                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)


def hook(args):
    data = json.load(sys.stdin)
    pid, argv = claude_process()
    if ("-p" in argv or "--print" in argv) and not REMOTE_FLAGS & set(argv):
        return 0  # scripted run, nobody can type into it
    req = {"session": data.get("session_id", ""), "prompt": data.get("prompt") or ""}
    try:
        if "--system" in args:
            res = subprocess.run(["sudo", "-n", SYSTEM_BIN, "check"], input=json.dumps(req), stdout=subprocess.PIPE,
                                 stderr=subprocess.PIPE, universal_newlines=True, timeout=20)
            out = json.loads(res.stdout or "{}") if res.returncode == 0 else {"reason": res.stderr.strip()}
        else:
            out = check(Store(store_dir()), req["session"], req["prompt"])
    except Exception as e:  # never let a broken check open the door
        out = {"allow": False, "reason": "remote-lock could not check the code: %s" % e}
    if out.get("lockdown"):
        lock_down(out["lockdown"], pid, argv)
    if not out.get("allow"):
        print(json.dumps({"decision": "block", "reason": out.get("reason") or "Locked."}))
    return 0


def check_cmd(_args):
    """Run by the hook through sudo when set up for the whole machine."""
    if not system():
        sys.exit("remote-lock check needs root")
    req = json.load(sys.stdin)
    print(json.dumps(check(Store(SYSTEM_DIR), str(req.get("session", "")), str(req.get("prompt", "")))))
    return 0


# -- Claude settings ------------------------------------------------------------------------------------------
def deny_rules(folder):
    return ["Read(%s/**)" % folder, "Edit(%s/**)" % folder, "Bash(remote-lock:*)"]


def add_hook(settings, command, folder):
    hooks = settings.setdefault("hooks", {}).setdefault("UserPromptSubmit", [])
    hooks[:] = [h for h in hooks if "remote-lock" not in json.dumps(h)]
    hooks.append({"hooks": [{"type": "command", "command": command}]})
    deny = settings.setdefault("permissions", {}).setdefault("deny", [])
    deny += [r for r in deny_rules(folder) if r not in deny]
    return settings


def remove_hook(settings, folder):
    hooks = settings.get("hooks", {})
    if "UserPromptSubmit" in hooks:
        hooks["UserPromptSubmit"] = [h for h in hooks["UserPromptSubmit"] if "remote-lock" not in json.dumps(h)]
        if not hooks["UserPromptSubmit"]:
            del hooks["UserPromptSubmit"]
    if not hooks:
        settings.pop("hooks", None)
    perm = settings.get("permissions", {})
    if "deny" in perm:
        perm["deny"] = [r for r in perm["deny"] if r not in deny_rules(folder)]
        if not perm["deny"]:
            del perm["deny"]
    if "permissions" in settings and not perm:
        del settings["permissions"]
    return settings


def edit_settings(change):
    path = settings_path()
    try:
        with open(path) as f:
            settings = json.load(f)
        shutil.copy(path, path + ".bak")
    except FileNotFoundError:
        settings = {}
    except ValueError:
        sys.exit("%s is not valid JSON; fix it first" % path)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path + ".new", "w") as f:
        json.dump(change(settings), f, indent=2)
        f.write("\n")
    os.chmod(path + ".new", 0o644 if system() else 0o600)
    os.replace(path + ".new", path)


# -- commands -------------------------------------------------------------------------------------------------
def show_qr(uri, secret):
    if shutil.which("qrencode"):  # from stdin: the secret never shows up in ps
        subprocess.run(["qrencode", "-t", "ANSIUTF8"], input=uri, universal_newlines=True)
    else:
        print("(install qrencode to get a QR code here)")
    print("Or add it by hand: key %s, time based." % " ".join(secret[i:i + 4] for i in range(0, len(secret), 4)))


def otp_uri(secret, label):
    return "otpauth://totp/%s?secret=%s&issuer=remote-lock" % (urllib.parse.quote("remote-lock:" + label), secret)


def setup(args):
    user = os.environ.get("SUDO_USER", "") if system() else ""
    if system() and not user:
        sys.exit("Run it with sudo from your own account, so it knows who may check codes")
    if "--stdin" in args:  # a secret made and checked elsewhere (an app showed you the QR code)
        secret = sys.stdin.readline().strip().upper()
        try:
            code_at(secret, 0)
        except ValueError:
            secret = ""
        if len(secret) < 16:
            sys.exit("No secret on stdin")
    else:
        secret = new_secret()
        label = "%s@%s" % (user or os.environ.get("USER", "me"), socket.gethostname().split(".")[0])
        print("Scan this with Google Authenticator (or any authenticator app):\n")
        show_qr(otp_uri(secret, label), secret)
        for _ in range(3):
            code = input("\nType the code the app shows: ").strip().replace(" ", "")
            if code_ok(secret, code, time.time()):
                break
            print("That code doesn't match. Check the phone's clock and try again.")
        else:
            sys.exit("Not set up.")
    store = Store(store_dir())
    store.write("secret", secret + "\n")
    store.write("config.json", store.config())
    store.write("state.json", {})
    os.chmod(store.dir, 0o700)
    target = bin_path()
    os.makedirs(os.path.dirname(target), exist_ok=True)
    if os.path.realpath(sys.argv[0]) != os.path.realpath(target):
        shutil.copy(sys.argv[0], target)
    os.chmod(target, 0o755)
    command = shlex.quote(target) + " hook" + (" --system" if system() else "")
    edit_settings(lambda s: add_hook(s, command, store.dir))
    if system():
        rule = "%s ALL=(root) NOPASSWD: %s check\n" % (user, SYSTEM_BIN)
        with open(SUDOERS + ".new", "w") as f:
            f.write(rule)
        os.chmod(SUDOERS + ".new", 0o440)
        if subprocess.run(["visudo", "-cf", SUDOERS + ".new"], stdout=subprocess.DEVNULL).returncode != 0:
            os.remove(SUDOERS + ".new")
            sys.exit("sudo rule was not accepted; nothing else to undo: run sudo remote-lock uninstall")
        os.replace(SUDOERS + ".new", SUDOERS)
    store.log("set up")
    print("\nDone. New Claude sessions are locked until you send a code. Settings: remote-lock status")
    return 0


def status(args):
    store = Store(store_dir())
    if "--json" in args:
        conf, state, now = store.config(), store.read("state.json", {}), time.time()
        print(json.dumps({"set_up": bool(store.read("secret", "")), "config": conf, "version": VERSION,
                          "locked": state.get("fails", 0) >= int(conf["tries"]),
                          "open": sum(1 for v in state.get("open", {}).values() if v > now),
                          "log": (store.read("log", "") or "").splitlines()[-20:]}))
        return 0
    if not store.read("secret", ""):
        print("Not set up here%s." % ("" if system() else " for you (for the whole machine, try sudo)"))
        return 1
    conf, state, now = store.config(), store.read("state.json", {}), time.time()
    print("Set up %s, settings in %s" % ("for the whole machine" if system() else "for you", settings_path()))
    print("minutes=%s tries=%s logout=%s scancel=%s" % (conf["minutes"], conf["tries"],
                                                         "on" if conf["logout"] else "off",
                                                         "on" if conf["scancel"] else "off"))
    if state.get("fails", 0) >= int(conf["tries"]):
        print("LOCKED after too many wrong codes. remote-lock reset unlocks it.")
    print("Open sessions: %d" % sum(1 for v in state.get("open", {}).values() if v > now))
    for line in (store.read("log", "") or "").splitlines()[-8:]:
        print("  " + line)
    return 0


def set_cmd(args):
    store = Store(store_dir())
    conf = store.config()
    for arg in args:
        key, _, value = arg.partition("=")
        if key in ("minutes", "tries") and value.isdigit():
            conf[key] = max(int(value), 1 if key == "tries" else 0)
        elif key in ("logout", "scancel") and value in ("on", "off"):
            conf[key] = value == "on"
        else:
            sys.exit("Unknown setting %r. Try minutes=10 tries=3 logout=on scancel=on" % arg)
    store.write("config.json", conf)
    store.log("set " + " ".join(args))
    return status([])


def lock(_args):
    store = Store(store_dir())
    state = store.read("state.json", {})
    state["open"] = {}
    store.write("state.json", state)
    store.log("locked by hand")
    print("Every session is locked.")
    return 0


def reset(_args):
    store = Store(store_dir())
    state = store.read("state.json", {})
    state.update(fails=0, open={})
    store.write("state.json", state)
    store.log("reset")
    print("Unlocked. Sessions still need a code.")
    return 0


def uninstall(_args):
    store = Store(store_dir())
    edit_settings(lambda s: remove_hook(s, store.dir))
    shutil.rmtree(store.dir, ignore_errors=True)
    for path in ([SUDOERS, SYSTEM_BIN] if system() else []):
        if os.path.exists(path):
            os.remove(path)
    print("Removed. Claude takes prompts without a code again.")
    return 0


COMMANDS = {"setup": setup, "status": status, "set": set_cmd, "lock": lock, "reset": reset,
            "uninstall": uninstall, "hook": hook, "check": check_cmd}


def main(argv):
    if not argv or argv[0] not in COMMANDS:
        print(__doc__.strip() + "\n\nversion " + VERSION)
        return 0 if argv[:1] in ([], ["-h"], ["--help"]) else 2
    return COMMANDS[argv[0]](argv[1:]) or 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
