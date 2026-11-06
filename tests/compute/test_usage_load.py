from hpc_hub.compute.usage import load


def test_load():
    text = ("@PART\ngeneral*|up|97|11682/734/0/12416\ngpu|up|28|1373/1955/256/3584\n"
            "@GPU\ngpu|gpu:a100_40g:4,gpu:a100_10g:8|gpu:a100_40g:1(IDX:0),gpu:a100_10g:0(IDX:N/A)|\n"
            "general|(null)|(null)|\n@PEND\n    102 general\n@RUN\n    211 general\n     79 gpu\n")
    g, gpu = load.parse_load(text)
    assert (g.name, g.cpus_used, g.cpus_total) == ("general", 11682, 12416)
    assert (g.pending, g.running, g.gpus_total) == (102, 211, 0)
    assert (gpu.gpus_used, gpu.gpus_total, gpu.pending) == (1, 12, 0)


def test_script_is_valid_bash():
    import subprocess
    assert subprocess.run(["bash", "-n", "-c", load.LOAD]).returncode == 0
