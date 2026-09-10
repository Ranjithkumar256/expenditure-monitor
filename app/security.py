"""
Security and authentication helper module for PaisaTrack.
Uses PBKDF2-HMAC-SHA256 with cryptographically secure random salt
and token generation via secrets standard library.
"""
import hashlib
import secrets
from typing import Tuple

ITERATIONS = 100000

def hash_password(password: str, salt: str = None) -> Tuple[str, str]:
    """
    Hashes a password with PBKDF2-HMAC-SHA256.
    Returns (hex_digest, salt_hex).
    """
    if not salt:
        salt = secrets.token_hex(16)
    
    dk = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        ITERATIONS
    )
    return dk.hex(), salt

def verify_password(password: str, expected_hash: str, salt: str) -> bool:
    """
    Verifies a password against the expected hash using constant-time comparison.
    """
    computed_hash, _ = hash_password(password, salt)
    return secrets.compare_digest(computed_hash, expected_hash)

def generate_session_token() -> str:
    """Generates a secure 64-character hex session token."""
    return secrets.token_hex(32)
