# Third-party code in the phone's VPN

`build.sh` downloads these from their own sites (versions and SHA256 pinned there) and builds them; nothing of
theirs is kept in this repository. The Android app ships two programs made from them, `libhpchub_openconnect.so`
and `libhpchub_ocproxy.so`, and their license texts in the APK's `assets/licenses/vpn/`.

| Project | Version | License | In |
| --- | --- | --- | --- |
| [OpenConnect](https://www.infradead.org/openconnect/) | 9.21 | LGPL-2.1 | openconnect |
| [json-parser](https://github.com/json-parser/json-parser) (inside OpenConnect) | | BSD-2-Clause | openconnect |
| [OpenSSL](https://www.openssl.org/) | 3.5.9 | Apache-2.0 | openconnect |
| [libxml2](https://gitlab.gnome.org/GNOME/libxml2) | 2.15.4 | MIT | openconnect |
| [zlib](https://zlib.net/) | 1.3.2 | zlib | openconnect |
| [ocproxy](https://github.com/cernekee/ocproxy) | c98f06d | BSD-3-Clause | ocproxy |
| [lwIP](https://savannah.nongnu.org/projects/lwip/) (inside ocproxy) | | BSD-3-Clause | ocproxy |
| [libevent](https://libevent.org/) | 2.1.13-stable | BSD-3-Clause | ocproxy |

OpenConnect is the one under a copyleft license. Its source is the upstream tarball, changed in one place:
`build.sh` makes `--script-tun` start its script with Android's shell (`_PATH_BSHELL`, `/system/bin/sh`) instead of
`/bin/sh`. Anyone can rebuild it, or swap in their own build, with `build.sh`; it runs as its own program, so
HPC Hub's MIT code is not combined with it. OpenSSL is used here as OpenConnect's TLS library, as OpenConnect
supports; GnuTLS (LGPL-2.1) would be the alternative.

[ics-openconnect](https://gitlab.com/openconnect/ics-openconnect) (GPL-2.0), OpenConnect's own Android app, is not
used: none of its code is here.
