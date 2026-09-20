"""
JWT auth middleware.
Reads JWT from httpOnly cookie 'session_token'.
Injects g.user = { id, role } on success.
Returns 401 if missing/invalid, 403 if role not permitted.
"""

import os
from functools import wraps
from flask import request, g, current_app
from jose import jwt, JWTError
from ..utils.errors import unauthorized, forbidden


def require_auth(roles: list[str] | None = None):
    """
    Decorator factory. Pass a list of allowed roles, or None to allow any authenticated user.

    Usage:
        @require_auth()
        @require_auth(["ADMIN"])
        @require_auth(["ADMIN", "PROJECT_MANAGER"])
    """
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            token = request.cookies.get("session_token")
            if not token:
                return unauthorized("Authentication required.")

            try:
                payload = jwt.decode(
                    token,
                    current_app.config["JWT_SECRET"],
                    algorithms=["HS256"],
                )
            except JWTError:
                return unauthorized("Invalid or expired session.")

            g.user = {
                "id": payload["sub"],
                "role": payload["role"],
            }

            if roles and g.user["role"] not in roles:
                return forbidden("You do not have permission to perform this action.")

            return fn(*args, **kwargs)
        return wrapper
    return decorator
