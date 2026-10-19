from hpc_hub import config


def test_defaults_per_cluster():
    by_id = {c.id: c for c in config.default_clusters()}
    assert by_id["wulver"].profile.cpus == 4
    assert by_id["yale"].profile.cpus == 2
    assert by_id["yale"].vpn.gateway == "access.yale.edu"
    assert not by_id["sdsc"].vpn.enabled


def test_round_trip(tmp_path):
    path = tmp_path / "clusters.toml"
    clusters = config.default_clusters()
    clusters[0].profile.cpus = 8
    clusters[0].profile.extra_args = 'say "hi"'
    clusters[1].vpn.enabled = False
    config.save(clusters, path)

    loaded = config.load(path)
    assert loaded[0].profile.cpus == 8
    assert loaded[0].profile.extra_args == 'say "hi"'
    assert loaded[1].vpn.enabled is False
    assert loaded[2].host == "login.expanse.sdsc.edu"


def test_unknown_keys_ignored(tmp_path):
    path = tmp_path / "clusters.toml"
    path.write_text('[clusters.wulver]\nbogus = 1\nport = "x"\n[clusters.nope]\nhost = "a"\n')
    loaded = config.load(path)
    assert loaded[0].port == 22
    assert len(loaded) == 3


def test_load_strips_user_from_host(tmp_path):
    path = tmp_path / "c.toml"
    path.write_text('[clusters.wulver]\nhost = "bd1@wulver.njit.edu"\n')
    assert config.load(path)[0].host == "wulver.njit.edu"


def test_reuse_running_job_roundtrip(tmp_path):
    clusters = config.default_clusters()
    clusters[0].reuse_running_job = True
    path = tmp_path / "c.toml"
    config.save(clusters, path)
    assert config.load(path)[0].reuse_running_job is True


def test_tool_settings_roundtrip(tmp_path):
    clusters = config.default_clusters()
    clusters[1].vscode.command = "vscode"
    clusters[1].claude.skip_permissions = True
    clusters[1].globus.collection_id = "abc"
    path = tmp_path / "c.toml"
    config.save(clusters, path)
    y = config.load(path)[1]
    assert (y.vscode.command, y.claude.skip_permissions, y.globus.collection_id) == ("vscode", True, "abc")


def test_app_settings(tmp_path):
    path = tmp_path / "app.toml"
    config.save_app(config.AppSettings(globus_client_id="cid"), path)
    assert config.load_app(path).globus_client_id == "cid"


def test_split_tunnel_defaults():
    by_id = {c.id: c for c in config.default_clusters()}
    assert by_id["wulver"].vpn.split_tunnel and by_id["wulver"].vpn.domains == "njit.edu"
    assert "128.36.0.0/16" in by_id["yale"].vpn.routes


def test_vscode_job_roundtrip(tmp_path):
    path = tmp_path / "c.toml"
    clusters = config.default_clusters()
    clusters[0].vscode.compute.gpus = 1
    clusters[0].vscode.compute.qos = "high"
    config.save(clusters, path)
    w = config.load(path)[0]
    assert (w.vscode.compute.gpus, w.vscode.compute.qos, w.vscode.compute.cpus) == (1, "high", 16)
    assert w.vscode.command.endswith(config.TUNNEL)


def test_empty_vscode_command_gets_default(tmp_path):
    path = tmp_path / "c.toml"
    path.write_text('[clusters.yale.vscode]\ncommand = ""\n')
    assert config.load(path)[1].vscode.command == f"{config.TUNNEL} --name yale"
