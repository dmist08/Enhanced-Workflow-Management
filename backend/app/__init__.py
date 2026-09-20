import os
from flask import Flask, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
from .extensions import db

load_dotenv()


def create_app():
    app = Flask(__name__)

    # Config
    db_url = os.environ.get("DATABASE_URL", "")
    if db_url.startswith("postgres://"):
        db_url = db_url.replace("postgres://", "postgresql://", 1)

    app.config["SQLALCHEMY_DATABASE_URI"] = db_url
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
    app.config["JWT_SECRET"] = os.environ.get("JWT_SECRET", "dev-secret-key")
    app.config["MAX_CONTENT_LENGTH"] = 16 * 1024 * 1024  # 16 MB limit for uploads

    # Extensions
    db.init_app(app)

    # CORS — allow frontend origin with credentials so the httpOnly cookie is sent
    raw_origins = os.environ.get("FRONTEND_ORIGIN", "http://localhost:3000")
    allowed_origins = [o.strip() for o in raw_origins.split(",") if o.strip()]
    CORS(
        app,
        origins=allowed_origins,
        supports_credentials=True,
    )

    # Health check endpoint for uptime monitoring & Fly.io deployment
    @app.route("/health", methods=["GET"])
    def health():
        return jsonify({"status": "ok", "service": "pravi-backend"}), 200

    # Blueprints
    from .routes.auth import auth_bp
    from .routes.admin import admin_bp
    from .routes.pm import pm_bp
    from .routes.field import field_bp
    from .routes.shared import shared_bp

    app.register_blueprint(auth_bp)
    app.register_blueprint(admin_bp)
    app.register_blueprint(pm_bp)
    app.register_blueprint(field_bp)
    app.register_blueprint(shared_bp)

    return app
