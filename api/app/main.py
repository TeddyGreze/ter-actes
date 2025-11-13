# api/app/main.py
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.staticfiles import StaticFiles
from fastapi.openapi.utils import get_openapi

from .database import Base, engine, SessionLocal
from .config import settings
from .routers_actes import router as actes_router
from .routers_admin import router as admin_router
from .routers_refs import router as refs_router
from .models_refs import ActType, Service

from swagger_ui_bundle import swagger_ui_3_path

import os
from pathlib import Path
from sqlalchemy import text

app = FastAPI(
    title="TER Actes API",
    version="0.3.0",
    openapi_url="/openapi.json",
    docs_url=None,
    redoc_url=None,
)

# --- CORS ---
origins = [o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)

# --- Sécurité : CSP stricte par défaut ---
@app.middleware("http")
async def security_headers(request: Request, call_next):
    resp = await call_next(request)

    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    resp.headers.setdefault("X-Frame-Options", "DENY")
    resp.headers.setdefault("Referrer-Policy", "no-referrer")
    resp.headers.setdefault("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload")

    csp_strict = (
        "default-src 'self'; "
        "img-src 'self' data:; "
        "style-src 'self' 'unsafe-inline'; "
        "script-src 'self'; "
        "frame-ancestors 'self'"
    )
    
    csp_docs = (
        "default-src 'self'; "
        "img-src 'self' data:; "
        "style-src 'self' 'unsafe-inline'; "
        "script-src 'self' 'unsafe-inline'; "
        "connect-src 'self'; "
        "frame-ancestors 'self'"
    )

    if request.url.path == "/docs":
        resp.headers["Content-Security-Policy"] = csp_docs
    else:
        resp.headers.setdefault("Content-Security-Policy", csp_strict)

    return resp

def seed_reference_data():
    with SessionLocal() as db:
        if db.query(ActType).count() == 0:
            db.add_all([ActType(name="Arrêté"), ActType(name="Délibération"), ActType(name="Décision"), ActType(name="Autre")])
        if db.query(Service).count() == 0:
            db.add_all([Service(name="Mairie"), Service(name="Culture"), Service(name="Voirie"), Service(name="Urbanisme")])
        db.commit()

def _ensure_fulltext_column():
    ddl = text("ALTER TABLE actes ADD COLUMN IF NOT EXISTS fulltext_content TEXT;")
    with engine.begin() as conn:
        conn.execute(ddl)

# --- Startup ---
@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)
    try:
        _ensure_fulltext_column()
        print("[startup] Colonne fulltext_content OK")
    except Exception as e:
        print(f"[startup][WARN] fulltext_content: {e}")
    try:
        seed_reference_data()
        print("[startup] Référentiels OK")
    except Exception as e:
        print(f"[startup][WARN] Seed: {e}")
    upload_dir = getattr(settings, "UPLOAD_DIR", None) or os.getenv("UPLOAD_DIR", "/data/uploads")
    try:
        p = Path(upload_dir); p.mkdir(parents=True, exist_ok=True)
        try:
            tf = p / ".write_test"; tf.write_text("ok"); tf.unlink(missing_ok=True)
        except Exception as e:
            print(f"[startup][WARN] Pas d'écriture sur {upload_dir}: {e}")
    except Exception as e:
        print(f"[startup][WARN] Création dossier upload: {e}")

# --- Routes ---
app.include_router(actes_router, prefix="")
app.include_router(admin_router, prefix="")
app.include_router(refs_router, prefix="")

def custom_openapi():
    if app.openapi_schema:
        return app.openapi_schema
    schema = get_openapi(title=app.title, version=app.version, routes=app.routes)
    schema["openapi"] = "3.0.3"
    app.openapi_schema = schema
    return app.openapi_schema
app.openapi = custom_openapi

# --- Swagger UI local ---
app.mount("/static", StaticFiles(directory=swagger_ui_3_path), name="static")

@app.get("/docs", include_in_schema=False)
def custom_swagger_ui():
    return get_swagger_ui_html(
        openapi_url=app.openapi_url,
        title="TER Actes API — Docs",
        swagger_js_url="/static/swagger-ui-bundle.js",
        swagger_css_url="/static/swagger-ui.css",
    )
