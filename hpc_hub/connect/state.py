"""Where a cluster connection is at."""

from enum import Enum


class State(Enum):
    DISCONNECTED = "Disconnected"
    VPN = "Connecting VPN"
    SIGNING_IN = "Signing in"
    DUO = "Approve Duo on your phone"
    ALLOCATING = "Requesting compute node"
    CONNECTED = "Connected"
    DISCONNECTING = "Disconnecting"
    ERROR = "Error"

    @property
    def busy(self) -> bool:
        return self in (State.VPN, State.SIGNING_IN, State.DUO, State.ALLOCATING, State.DISCONNECTING)
