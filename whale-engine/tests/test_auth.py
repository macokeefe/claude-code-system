"""Auth tests — verify the RSA-PSS signing round-trips.

Generates a throwaway key in-memory (no real credentials needed) and
confirms the signature Whale Engine produces validates against the
public key, using the exact message format Kalshi expects.

Skips automatically if `cryptography` isn't installed.
"""

import base64
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import padding, rsa
    HAVE_CRYPTO = True
except BaseException:  # ImportError, or a broken native build (pyo3 panic)
    HAVE_CRYPTO = False

from whale_engine.auth import KalshiAuth  # noqa: E402


@unittest.skipUnless(HAVE_CRYPTO, "cryptography not installed")
class AuthTests(unittest.TestCase):
    def setUp(self):
        self.key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        self.pem = self.key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        )
        self.auth = KalshiAuth("test-key-id", self.pem)

    def test_headers_present(self):
        h = self.auth.headers("GET", "/trade-api/v2/markets")
        self.assertEqual(h["KALSHI-ACCESS-KEY"], "test-key-id")
        self.assertIn("KALSHI-ACCESS-SIGNATURE", h)
        self.assertTrue(h["KALSHI-ACCESS-TIMESTAMP"].isdigit())

    def test_signature_verifies(self):
        path = "/trade-api/v2/markets"
        h = self.auth.headers("GET", path)
        message = (h["KALSHI-ACCESS-TIMESTAMP"] + "GET" + path).encode("utf-8")
        sig = base64.b64decode(h["KALSHI-ACCESS-SIGNATURE"])
        # raises InvalidSignature if the format is wrong
        self.key.public_key().verify(
            sig, message,
            padding.PSS(mgf=padding.MGF1(hashes.SHA256()),
                        salt_length=padding.PSS.DIGEST_LENGTH),
            hashes.SHA256(),
        )

    def test_from_env_none_without_creds(self):
        for var in ("KALSHI_API_KEY_ID", "KALSHI_PRIVATE_KEY", "KALSHI_PRIVATE_KEY_PATH"):
            os.environ.pop(var, None)
        self.assertIsNone(KalshiAuth.from_env())

    def test_from_env_loads_inline_pem(self):
        os.environ["KALSHI_API_KEY_ID"] = "abc"
        os.environ["KALSHI_PRIVATE_KEY"] = self.pem.decode("utf-8")
        os.environ.pop("KALSHI_PRIVATE_KEY_PATH", None)
        try:
            auth = KalshiAuth.from_env()
            self.assertIsNotNone(auth)
            self.assertEqual(auth.key_id, "abc")
        finally:
            os.environ.pop("KALSHI_API_KEY_ID", None)
            os.environ.pop("KALSHI_PRIVATE_KEY", None)


if __name__ == "__main__":
    unittest.main()
