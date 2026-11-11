from hpc_hub.core.scrub import Known, scrub

KNOWN = Known(users={"jdoe", "jane.doe"}, accounts={"abc123"}, groups={"mygroup"}, hosts={"jdoe-laptop"},
              homes={"/home/jdoe"}, secrets={"hunter2!"})


def test_secrets_are_hidden():
    text = "\n".join([
        "password=hunter2! sent", 'login {"password": "s3cret", "user": "x"}', "token: abc.def",
        "Cookie: acSamlv2Token=XYZ; other=1", "Authorization: Bearer eyJhbGciOi.payloadpart.sig",
        "url https://jdoe:pa55@example.org/x?api_key=K123&page=2", "typed hunter2! by mistake",
        "-----BEGIN OPENSSH PRIVATE KEY-----\nAAAAB3Nza\n-----END OPENSSH PRIVATE KEY-----",
        "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIF0abcdefghij jdoe@host", "gh token ghp_abcdefghijklmnopqrstuvwxyz0123",
        "session 0123456789abcdef0123456789abcdef", "blob Qm9vb2tzQWJjMTIzNDU2Nzg5MGFiY2RlZmdoaWpr"])
    out = scrub(text, KNOWN)
    for leaked in ("hunter2", "s3cret", "abc.def", "XYZ", "eyJhbG", "pa55", "K123", "AAAAB3Nza", "AAAAC3Nza",
                   "ghp_", "0123456789abcdef", "Qm9vb2tz"):
        assert leaked not in out, leaked
    assert "page=2" in out and '"user": "x"' in out and "<hidden>" in out


def test_names_paths_emails_and_addresses_become_placeholders():
    text = ("jdoe on JDOE-laptop: cd /home/jdoe/thesis; /home/other/x; C:\\Users\\Someone\\file; "
            "sbatch -A abc123 /project/mygroup/jdoe/run.sh; mail jane.doe@example.edu; from 10.0.0.7 and "
            "fe80::1c2b:3a4d; jdoex stays")
    out = scrub(text, KNOWN)
    assert out == ("<user> on <host>: cd <home>/thesis; <home>/x; <home>\\file; "
                   "sbatch -A <account> /project/<group>/<user>/run.sh; mail <email>; from <ip> and "
                   "<ip>; jdoex stays")


def test_ordinary_text_stays():
    text = "15:02:11  Connecting to login.example.edu, job 1-12:00:00 a[::2] 127.0.0.1 v0.1.0 Password for you:"
    assert scrub(text, KNOWN) == text


def test_twice_is_the_same_so_what_is_shown_is_what_is_sent():
    names = Known(users={"user", "home"}, groups={"group"})  # even names that look like placeholders
    text = "user home group jdoe@example.edu 10.1.2.3 token=abc /home/user/x"
    once = scrub(text, names)
    assert once == "<user> <user> <group> <email> <ip> token=<hidden> <home>/x"
    assert scrub(once, names) == once


def test_nothing_known_still_hides_the_generic_parts():
    assert scrub("jdoe@example.com at 192.168.1.20 in /Users/jdoe") == "<email> at <ip> in <home>"
