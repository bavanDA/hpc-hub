#!/bin/sh
# HPC Hub's wrapper around vpnc-script (macOS), from docs/design/vpn-helper.md.
# openconnect runs it with HPCHUB_ROUTES="cidr cidr...", HPCHUB_DOMAINS="d d..." and HPCHUB_TAG (the
# tunnel's name). When HPCHUB_ROUTES has routes, only they go through the tunnel, not the ones the server
# pushes. When HPCHUB_DOMAINS has domains, only names in them go to the VPN's DNS servers, through
# /etc/resolver/<domain> files marked "# hpc-hub <tag>" (the helper removes them when the tunnel ends), and
# vpnc-script leaves the system's DNS alone: so several VPNs can be up side by side. Then the real
# vpnc-script (next to this file) runs with the same environment.

set -eu

die() {
	echo "hpchub-script: $*" >&2
	exit 2
}

# a number from 0 to $2, no leading zeros
uint() {
	case $1 in '' | *[!0-9]* | 0?*) return 1 ;; esac
	[ "${#1}" -le 3 ] && [ "$1" -le "$2" ]
}

# dotted IPv4 address, four numbers from 0 to 255
ip4() {
	case $1 in *[!0-9.]* | .* | *. | *..*) return 1 ;; esac
	_ifs=$IFS
	IFS=.
	# shellcheck disable=SC2086 # split on the dots
	set -- $1
	IFS=$_ifs
	[ $# -eq 4 ] || return 1
	for _o; do uint "$_o" 255 || return 1; done
}

# prefix length -> dotted mask, e.g. 20 -> 255.255.240.0
mask4() {
	_len=$1 _out='' _i=0
	while [ "$_i" -lt 4 ]; do
		if [ "$_len" -ge 8 ]; then
			_o=255 _len=$((_len - 8))
		else
			_o=$(((256 - (1 << (8 - _len))) & 255)) _len=0
		fi
		_out=${_out:+$_out.}$_o
		_i=$((_i + 1))
	done
	echo "$_out"
}

# address and mask -> network address (routes refuse host bits)
net4() {
	_ifs=$IFS
	IFS=.
	# shellcheck disable=SC2086 # split on the dots
	set -- $1 $2
	IFS=$_ifs
	echo "$(($1 & $5)).$(($2 & $6)).$(($3 & $7)).$(($4 & $8))"
}

set -f # no globbing while splitting the lists
n4=0 n6=0
for route in ${HPCHUB_ROUTES:-}; do
	case $route in
	*/*)
		addr=${route%/*} len=${route##*/}
		[ -n "$len" ] || die "bad prefix length: $route"
		;;
	*) addr=$route len='' ;;
	esac
	case $addr in
	*:*)
		case $addr in *[!0-9A-Fa-f:.]*) die "not an IPv6 route: $route" ;; esac
		uint "${len:-128}" 128 || die "bad prefix length: $route"
		export "CISCO_IPV6_SPLIT_INC_${n6}_ADDR=$addr" "CISCO_IPV6_SPLIT_INC_${n6}_MASKLEN=${len:-128}"
		n6=$((n6 + 1))
		;;
	*)
		ip4 "$addr" || die "not an IPv4 route: $route"
		uint "${len:-32}" 32 || die "bad prefix length: $route"
		mask=$(mask4 "${len:-32}")
		export "CISCO_SPLIT_INC_${n4}_ADDR=$(net4 "$addr" "$mask")" "CISCO_SPLIT_INC_${n4}_MASK=$mask" \
			"CISCO_SPLIT_INC_${n4}_MASKLEN=${len:-32}"
		n4=$((n4 + 1))
		;;
	esac
done
if [ $((n4 + n6)) -gt 0 ]; then
	# both counts, even 0, so neither family gets a default route through the tunnel
	export CISCO_SPLIT_INC=$n4 CISCO_IPV6_SPLIT_INC=$n6
fi

dns=''
for domain in ${HPCHUB_DOMAINS:-}; do
	case $domain in *[!A-Za-z0-9.-]*) die "not a DNS domain: $domain" ;; esac
	dns=${dns:+$dns,}$domain
done
if [ -n "$dns" ]; then
	export CISCO_SPLIT_DNS="$dns"
	tag=${HPCHUB_TAG:-}
	case $tag in '' | -* | *[!a-z0-9-]*) die "not a tunnel name: $tag" ;; esac
	if [ "${reason:-}" = connect ]; then
		servers=''
		for server in ${INTERNAL_IP4_DNS:-} ${INTERNAL_IP6_DNS:-}; do
			case $server in *[!0-9A-Fa-f:.]*) die "not a DNS server: $server" ;; esac
			servers="$servers
nameserver $server"
		done
		resolver=${HPCHUB_RESOLVER_DIR:-/etc/resolver} # tests only: the helper never sets it
		if [ -n "$servers" ]; then
			mkdir -p "$resolver"
			for domain in ${HPCHUB_DOMAINS:-}; do
				case $domain in .* | *. | *..*) die "not a DNS domain: $domain" ;; esac
				file=$resolver/$domain
				if [ -L "$file" ] || { [ -e "$file" ] && ! head -n 1 "$file" | grep -q '^# hpc-hub '; }; then
					echo "hpchub-script: $file is not HPC Hub's, so it is left as it is" >&2
					continue
				fi
				printf '# hpc-hub %s%s\n' "$tag" "$servers" >"$file.hpchub"
				mv -f "$file.hpchub" "$file"
			done
		fi
	fi
	unset INTERNAL_IP4_DNS INTERNAL_IP6_DNS CISCO_DEF_DOMAIN
fi
set +f

here=$(cd -- "$(dirname -- "$0")" && pwd -P)
exec /bin/sh "$here/vpnc-script" "$@"
