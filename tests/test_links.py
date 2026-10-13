from hpc_hub import links

OUT = """*
* Visual Studio Code Server
*
To grant access to the server, please log into https://github.com/login/device and use code AB12-CD34
Open this link in your browser https://vscode.dev/tunnel/bouchet-r101u05/home/jdoe
Web UI available at http://127.0.0.1:8000?tkn=abc123
see https://docs.example.org/x for help
"""


def test_find_links():
    found = {l.kind: l for l in links.find_links(OUT)}
    assert found[links.DEVICE_LOGIN].code == "AB12-CD34"
    assert found[links.TUNNEL].url == "https://vscode.dev/tunnel/bouchet-r101u05/home/jdoe"
    web = found[links.LOCAL_WEB]
    assert (web.host, web.port) == ("127.0.0.1", 8000)
    assert links.local_url(web, 40001) == "http://127.0.0.1:40001?tkn=abc123"
    assert len(found) == 3


def test_node_url():
    found = links.find_links("listening on http://r101u05.bouchet:8080/", node="r101u05")
    assert found[0].kind == links.LOCAL_WEB and found[0].port == 8080
