"""Checking a typed username and password before the first connect: the password is sent, and the question that
comes next tells whether it was right. Duo is never answered, so no push goes to the phone."""

import pytest

from hpc_hub.connect import login_check
from hpc_hub.core import config
from hpc_hub.core.ssh import SshError

WULVER = next(c for c in config.default_clusters() if c.id == "wulver")


class Askpass:
    def register(self, handler):
        self.handler = handler
        return "t"

    def unregister(self, token):
        self.handler = None

    def env(self, token):
        return {}


def cluster_asking(*questions, logs_in=False):
    """A stand-in login that asks these questions in turn, stopping at the first one left unanswered."""
    class Master:
        def __init__(self, cfg, username, env, log, ask=None):
            self.cfg, self.ask, self.stopped = cfg, ask, False
            made.append(self)

        def start(self, timeout=180, cancelled=lambda: False):
            for q in questions:
                if self.ask(q) is None:
                    raise SshError("Permission denied (keyboard-interactive).")
            if not logs_in:
                raise SshError("Permission denied (keyboard-interactive).")

        def stop(self):
            self.stopped = True
    made = []
    return Master, made


@pytest.fixture
def online(monkeypatch):
    monkeypatch.setattr(login_check, "reachable", lambda host, port: True)


def test_right_password_stops_at_duo_without_a_push(online, monkeypatch):
    master, made = cluster_asking("Password: ", "Passcode or option (1-3): ")
    monkeypatch.setattr(login_check, "new_master", master)
    got = login_check.check(WULVER, Askpass(), "ab123", "secret")
    assert got["ok"] is True and made[0].stopped
    assert made[0].cfg.id != WULVER.id  # its own socket: a real connection to the cluster is never touched


def test_wrong_password_is_asked_again(online, monkeypatch):
    master, _ = cluster_asking("Password: ", "Password: ")
    monkeypatch.setattr(login_check, "new_master", master)
    got = login_check.check(WULVER, Askpass(), "ab123", "nope")
    assert got["ok"] is False and "didn't accept the password for ab123" in got["text"]


def test_a_cluster_with_no_second_step_just_logs_in(online, monkeypatch):
    master, _ = cluster_asking("Password: ", logs_in=True)
    monkeypatch.setattr(login_check, "new_master", master)
    assert login_check.check(WULVER, Askpass(), "ab123", "secret")["ok"] is True


def test_off_campus_without_the_vpn_it_says_it_will_check_later(monkeypatch):
    monkeypatch.setattr(login_check, "reachable", lambda host, port: False)
    got = login_check.check(WULVER, Askpass(), "ab123", "secret")
    assert got["ok"] is None and "checked when you connect" in got["text"]
