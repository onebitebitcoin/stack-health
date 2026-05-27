import secrets
import time

_BASE62 = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"


def _int_to_base62(n: int) -> str:
    if n == 0:
        return _BASE62[0]
    chars: list[str] = []
    while n:
        chars.append(_BASE62[n % 62])
        n //= 62
    return "".join(reversed(chars))


def generate_share_token(user_id: int) -> str:
    """Base62 token from timestamp_sec + user_id + random bits (~10 chars)."""
    ts_sec = int(time.time())
    rand = secrets.randbits(16)
    n = (ts_sec << 26) | ((user_id & 0x3FF) << 16) | rand
    return _int_to_base62(n)
