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
