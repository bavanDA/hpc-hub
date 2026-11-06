"""What a failed connect says on the card: the raw ssh or VPN error goes to the log, the card gets a sentence a
person can act on."""

from ..core.config import ClusterConfig

CANCELLED = "You cancelled the sign-in."
STOPPED_WAITING = "You stopped waiting for a node."


def plain(err: str, cfg: ClusterConfig) -> str:
    """A sentence for the card. Unknown errors pass through as they are."""
    low = err.lower()
    if "ssh login timed out" in low:
        if cfg.second_factor == "duo":
            return "Duo wasn't approved in time. Click Try again and approve the push on your phone."
        return "The sign-in took too long. Click Try again."
    if "vpn login timed out" in low:
        return "The VPN sign-in took too long. Click Try again."
    if "permission denied" in low and not cfg.key_page:
        if cfg.second_factor == "code":
            return f"{cfg.name} didn't accept the sign-in. Check your username, password and code, then try again."
        label = cfg.username_label or "username"
        return f"{cfg.name} didn't accept your {label} or password. Check them in Settings, then try again."
    if "connection timed out" in low or "no route to host" in low or "could not resolve" in low:
        return f"Can't reach {cfg.name} from this network." + (" Is the VPN on?" if cfg.vpn.enabled else "")
    return err
