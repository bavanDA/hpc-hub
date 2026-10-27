"""VPN on Android. Not in the app yet (docs/design/android.md, VPN): a cluster that is reachable directly (campus
Wi-Fi, or Cisco's own VPN app running) connects without it; otherwise this says what to do."""

from .vpn import Vpn, VpnError

NOT_YET = ("The VPN is not in the phone app yet. Use campus Wi-Fi, or turn on the Cisco Secure Client app, "
           "then connect again.")


class AndroidVpn(Vpn):
    def is_active(self) -> bool:
        return False

    def ensure_profile(self) -> None:
        raise VpnError(NOT_YET)
