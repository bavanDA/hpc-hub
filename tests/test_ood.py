from hpc_hub import ood

PAGE = ('<meta name="csrf-token" content="abc&amp;1" /><a title="Logged in as bdx" data-placement="bottom">'
        '<li> <a title="Home Directory" class="dropdown-item" href="/pun/sys/dashboard/files/fs/home/bdx/expanse">')


def test_parse_dashboard():
    assert ood.parse_user(PAGE) == "bdx"
    assert ood.parse_home(PAGE) == "/home/bdx/expanse"
    assert ood.parse_csrf(PAGE) == "abc&1"
    assert ood.parse_user("<html>login</html>") == ""


def test_with_key():
    key = "ssh-ed25519 AAAA me@laptop"
    assert ood.with_key("", key) == key + "\n"
    assert ood.with_key("ssh-rsa BBBB old", key) == "ssh-rsa BBBB old\n" + key + "\n"
    assert ood.with_key("ssh-ed25519 AAAA other-comment\n", key) is None
