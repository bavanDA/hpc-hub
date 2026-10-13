from hpc_hub import prompts as p

DUO_MENU = """Duo two-factor login for jdoe

Enter a passcode or select one of the following options:

 1. Duo Push to XXX-XXX-1234
 2. Phone call to XXX-XXX-1234

Passcode or option (1-2): """


def test_classify():
    assert p.classify("(jdoe@wulver.njit.edu) Password: ") == p.PASSWORD
    assert p.classify(DUO_MENU) == p.DUO
    assert p.classify("Passcode or option (1-2): ") == p.DUO
    assert p.classify("Second Password:") == p.DUO
    assert p.classify("Username:") == p.USERNAME
    assert p.classify("GROUP: [Yale|Other]:") == p.GROUP
    assert p.classify("Enter passphrase for key '/home/x/.ssh/id_ed25519': ") == p.PASSPHRASE
    assert p.classify("Verification code: ") == p.UNKNOWN


def test_group_choice():
    assert p.group_choice("GROUP: [A|B]:", "B") == "B"
    assert p.group_choice("GROUP: [A|B]:", "") == "A"
    assert p.group_choice("GROUP: [A|B]:", "C") == "A"


YALE_DUO = """(jdoe@bouchet.ycrc.yale.edu) Duo two-factor login for jdoe

Enter a passcode or select one of the following options:

1. Duo Push to XXX-XXX-3017
2. Phone call to XXX-XXX-3017

Passcode or option (1-2): """


def test_duo_reply_menu():
    assert p.duo_reply(YALE_DUO, "push") == "1"
    assert p.duo_reply(YALE_DUO, "phone") == "2"
    assert p.duo_reply(YALE_DUO, "123456") == "123456"
    assert p.duo_reply("Duo Action:", "push") == "push"
