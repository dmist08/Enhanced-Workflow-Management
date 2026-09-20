from flask import jsonify


def bad_request(message: str, field: str | None = None):
    body = {"error": message}
    if field:
        body["field"] = field
    return jsonify(body), 400


def unauthorized(message: str = "Authentication required."):
    return jsonify({"error": message}), 401


def forbidden(message: str = "Forbidden."):
    return jsonify({"error": message}), 403


def not_found(message: str = "Resource not found."):
    return jsonify({"error": message}), 404


def conflict(message: str):
    return jsonify({"error": message}), 409


def server_error(message: str = "Internal server error."):
    return jsonify({"error": message}), 500


def ok(data, status: int = 200):
    return jsonify(data), status
