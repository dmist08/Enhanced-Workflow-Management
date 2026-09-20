import os
from datetime import datetime, timedelta, timezone
from flask import Blueprint, request, current_app
from jose import jwt
from ..extensions import db
from ..models import User
from ..utils.errors import bad_request, unauthorized, ok
import bcrypt

auth_bp = Blueprint("auth", __name__)

JWT_ALGORITHM = "HS256"
JWT_EXPIRY_HOURS = 24


@auth_bp.route("/auth/login", methods=["POST"])
def login():
    data = request.get_json(silent=True)
    if not data:
        return bad_request("Request body must be JSON.")

    email = data.get("email", "").strip().lower()
    password = data.get("password", "")

    if not email:
        return bad_request("email is required.", field="email")
    if not password:
        return bad_request("password is required.", field="password")

    user = User.query.filter_by(email=email).first()
    if not user:
        return unauthorized("Invalid email or password.")

    if not bcrypt.checkpw(password.encode(), user.password_hash.encode()):
        return unauthorized("Invalid email or password.")

    now = datetime.now(tz=timezone.utc)
    payload = {
        "sub": user.id,
        "role": user.role,
        "name": user.name,
        "iat": now,
        "exp": now + timedelta(hours=JWT_EXPIRY_HOURS),
    }
    token = jwt.encode(payload, current_app.config["JWT_SECRET"], algorithm=JWT_ALGORITHM)

    response = ok({
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "role": user.role,
        "token": token,
    })

    # Set httpOnly cookie — JS cannot read this, preventing XSS theft
    # In production (HTTPS), use SameSite=None; Secure=True
    # In development (HTTP), use SameSite=Lax; Secure=False
    is_prod = os.environ.get("FLASK_ENV") == "production"
    response[0].set_cookie(
        "session_token",
        token,
        httponly=True,
        samesite="None" if is_prod else "Lax",
        secure=is_prod,
        max_age=JWT_EXPIRY_HOURS * 3600,
        path="/",
    )
    return response


@auth_bp.route("/auth/logout", methods=["POST"])
def logout():
    is_prod = os.environ.get("FLASK_ENV") == "production"
    response = ok({"message": "Logged out."})
    response[0].delete_cookie(
        "session_token", path="/",
        samesite="None" if is_prod else "Lax",
        secure=is_prod,
    )
    return response


@auth_bp.route("/auth/me", methods=["GET"])
def me():
    """Returns current user info — useful for frontend to rehydrate auth state."""
    from ..middleware.auth import require_auth
    from flask import g

    token = request.cookies.get("session_token")
    if not token:
        return unauthorized("Not authenticated.")
    try:
        from jose import jwt as jose_jwt, JWTError
        payload = jose_jwt.decode(token, current_app.config["JWT_SECRET"], algorithms=["HS256"])
    except Exception:
        return unauthorized("Invalid session.")

    user = User.query.get(payload["sub"])
    if not user:
        return unauthorized("User not found.")
    return ok(user.to_dict())
