from __future__ import annotations
import logging
from typing import Optional

import httpx
import jwt
from fastapi import HTTPException, Request

logger = logging.getLogger(__name__)

_jwks_client: Optional[jwt.PyJWKClient] = None


def init_jwks(supabase_url: str):
    """Initialize the JWKS client for Supabase JWT verification."""
    global _jwks_client
    jwks_url = f"{supabase_url}/auth/v1/.well-known/jwks.json"
    _jwks_client = jwt.PyJWKClient(jwks_url, cache_keys=True)
    logger.info(f"[jwks] initialized from {jwks_url}")


def verify_token(token_str: str) -> dict:
    """Parse and validate a Supabase JWT using JWKS public keys. Returns claims dict."""
    if _jwks_client is None:
        raise HTTPException(status_code=500, detail="JWKS not initialized")
    try:
        signing_key = _jwks_client.get_signing_key_from_jwt(token_str)
        claims = jwt.decode(
            token_str,
            signing_key.key,
            algorithms=["ES256", "RS256"],
            options={"verify_aud": False},
        )
        return claims
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="token expired")
    except jwt.InvalidTokenError as e:
        raise HTTPException(status_code=401, detail=f"invalid token: {e}")


async def get_current_user(request: Request) -> tuple[str, str]:
    """FastAPI dependency: extracts and verifies user from Authorization header.
    Returns (user_id, email)."""
    auth_header = request.headers.get("Authorization", "")
    if not auth_header:
        raise HTTPException(status_code=401, detail="missing authorization header")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="invalid authorization format")

    token_str = auth_header[7:]
    claims = verify_token(token_str)

    user_id = claims.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="invalid token")

    email = claims.get("email", "")
    return user_id, email
