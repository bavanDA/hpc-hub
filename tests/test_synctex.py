import gzip

from hpc_hub.synctex import SyncTex

TEXT = """SyncTeX Version:1
Input:1:/s/paper/./main.tex
Input:2:/s/paper/./intro.tex
Output:pdf
Magnification:1000
Unit:1
X Offset:0
Y Offset:0
Content:
{1
[1,10:4736286,47316992:31983207,42580706,157288
x1,35:4776844,34816000
g1,35:4776844,34816000
x2,3:4776844,40000000
}1
{2
x1,52:4776844,10000000
}2
"""


def test_edit_and_view():
    st = SyncTex.from_gz(gzip.compress(TEXT.encode()))
    assert st.inputs[1] == "/s/paper/main.tex"
    spot = st.spots[1]
    assert round(spot.x, 1) == 72.6 and round(spot.y, 1) == 529.3
    assert st.edit(1, 80, 530) == ("/s/paper/main.tex", 35)
    assert st.edit(1, 80, 605) == ("/s/paper/intro.tex", 3)
    assert st.edit(2, 0, 0) == ("/s/paper/main.tex", 52)
    assert st.view("/s/paper/main.tex", 50).page == 2  # nearest line that shows up
    v = st.view("/mmfs1/s/paper/intro.tex", 3, folder="/mmfs1/s/paper")  # symlinked path
    assert (v.page, v.line) == (1, 3)
    assert st.view("/s/paper/other.tex", 1) is None
