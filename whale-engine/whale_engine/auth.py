"""Kalshi API-key authentication (RSA request signing).

Kalshi authenticates each request with an RSA signature. You generate an
API key in your Kalshi account, which gives you:
  - a Key ID (a uuid string)
  - an RSA private key (a .pem / .key file you download once)

For every request we sign the string `timestamp + METHOD + path` with
RSA-PSS / SHA-256 and send three headers. The private key never leaves
your machine and is never sent over the wire — only the signature is.

Credentials are read from the environment so nothing secret is committed:
  KALSHI_API_KEY_ID    your Key ID
  KALSHI_PRIVATE_KEY_PATH   path to the downloaded private-key file
    (or) KALSHI_PRIVATE_KEY  the PEM text itself

Requires the `cryptography` package (pip install cryptography). If no
credentials are configured the adapter falls back to unauthenticated
public access.
"""

from __future__ import annotations

import base64
import os
import time


class KalshiAuth:
    def __init__(self, key_id: str, private_key_pem: bytes) -> None:
        # Imported lazily so the rest of the project stays stdlib-only.
        from cryptography.hazmat.primitives import serialization

        if not key_id:
            raise ValueError("Kalshi key_id is empty")
        self.key_id = key_id
        self._private_key = serialization.load_pem_private_key(
            private_key_pem, password=None
        )

    @classmethod
    def from_env(cls) -> "KalshiAuth | None":
        """Build from environment variables, or None if not configured."""
        key_id = os.environ.get("KALSHI_API_KEY_ID", "").strip()
        pem_text = os.environ.get("KALSHI_PRIVATE_KEY", "")
        pem_path = os.environ.get("KALSHI_PRIVATE_KEY_PATH", "").strip()

        if not key_id or (not pem_text and not pem_path):
            return None

        if pem_text:
            pem = pem_text.encode("utf-8")
        else:
            with open(os.path.expanduser(pem_path), "rb") as fh:
                pem = fh.read()
        return cls(key_id, pem)

    def headers(self, method: str, path: str) -> dict[str, str]:
        """Signed auth headers for a request. `path` excludes the query string."""
        from cryptography.hazmat.primitives import hashes
        from cryptography.hazmat.primitives.asymmetric import padding

        timestamp = str(int(time.time() * 1000))
        message = (timestamp + method.upper() + path).encode("utf-8")
        signature = self._private_key.sign(
            message,
            padding.PSS(
                mgf=padding.MGF1(hashes.SHA256()),
                salt_length=padding.PSS.DIGEST_LENGTH,
            ),
            hashes.SHA256(),
        )
        return {
            "KALSHI-ACCESS-KEY": self.key_id,
            "KALSHI-ACCESS-SIGNATURE": base64.b64encode(signature).decode("utf-8"),
            "KALSHI-ACCESS-TIMESTAMP": timestamp,
        }
