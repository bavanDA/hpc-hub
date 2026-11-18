from hpc_hub.connect import prompts as p

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
    assert p.classify("Verification code: ") == p.CODE
    assert p.classify("(jdoe@login.expanse.sdsc.edu) TOTP code for jdoe: ") == p.CODE


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


# -- Duo methods: push, phone call, text message, passcode (2026-11-19: users without Duo Push could not sign in)

NJIT_DUO = """Duo two-factor login for jdoe

Enter a passcode or select one of the following options:

 1. Duo Push to XXX-XXX-1234
 2. Phone call to XXX-XXX-1234
 3. SMS passcodes to XXX-XXX-1234

Passcode or option (1-3): """
ASA_DUO = "Second Password:"  # a VPN's Duo: no menu, it takes push, phone, sms or a passcode as the answer


def test_duo_method_reads_old_and_new_answers():
    assert p.duo_method("push") == p.duo_method("") == p.duo_method("anything else") == "push"
    assert p.duo_method("push2") == "push" and p.duo_method("Phone") == "phone"
    assert p.duo_method("sms") == "sms" and p.duo_method("passcode") == "passcode"
    assert p.duo_method("123456") == "passcode"  # once a passcode could be saved as the answer itself


def test_push_and_phone_answer_once_then_stop():
    assert p.duo_action(NJIT_DUO, "push", 1) == (p.SEND, "1")
    assert p.duo_action(NJIT_DUO, "phone", 1) == (p.SEND, "2")
    assert p.duo_action(ASA_DUO, "push", 1) == (p.SEND, "push")
    assert p.duo_action(ASA_DUO, "phone", 1) == (p.SEND, "phone")
    assert p.duo_action(NJIT_DUO, "push", 2)[0] == p.STOP  # never a second push: that is how accounts get locked
    assert p.duo_action(NJIT_DUO, "", 1) == (p.SEND, "1")  # nothing saved: push


def test_text_message_picks_sms_then_asks_for_the_code():
    assert p.duo_action(NJIT_DUO, "sms", 1) == (p.SEND, "3")  # the menu's SMS line, whatever its number
    assert p.duo_action(NJIT_DUO, "sms", 2) == (p.ASK, p.ASK_SMS)
    assert p.duo_action(NJIT_DUO, "sms", 3)[0] == p.STOP
    assert p.duo_action(ASA_DUO, "sms", 1) == (p.SEND, "sms")  # a VPN without a menu takes the word


def test_a_menu_without_sms_still_gets_the_word():
    two = "1. Duo Push to XXX-XXX-3017\n2. Phone call to XXX-XXX-3017\nPasscode or option (1-2): "
    assert p.duo_action(two, "sms", 1) == (p.SEND, "sms")


def test_after_a_vpn_texted_the_codes_it_asks_for_one():
    assert p.duo_action(ASA_DUO, p.TEXTED, 1) == (p.ASK, p.ASK_SMS)
    assert p.duo_action(ASA_DUO, p.TEXTED, 2)[0] == p.STOP


def test_passcode_asks_you_and_never_sends_on_its_own():
    assert p.duo_action(NJIT_DUO, "passcode", 1) == (p.ASK, p.ASK_PASSCODE)
    assert p.duo_action(ASA_DUO, "passcode", 1) == (p.ASK, p.ASK_PASSCODE)
    assert p.duo_action(NJIT_DUO, "passcode", 2)[0] == p.STOP
