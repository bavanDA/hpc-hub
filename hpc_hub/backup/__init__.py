"""The backup agent: find what scratch's purge timer is about to delete, keep what matters (results, code,
writing), and copy it to your project folder on the cluster. It never deletes, moves or touches files in scratch.

policy.py    each cluster's purge rule (researched, plus what the cluster says at run time)
classify.py  which kind of file a path is (results, code, ...); also runs on the cluster
summarize.py the scan's summary, run on the cluster over find's output
scan.py      the scan job; agent.py the agent that refines the choices; plan.py what to copy and its space
copy.py      the trial run, copy and check job; listfilter.py its file list, run on the cluster
remind.py    the weekly check and the alerts between scans
"""
