# api/app/main.py
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.staticfiles import StaticFiles

from .database import Base, engine, SessionLocal  # <-- SessionLocal pour le seed
from .config import settings
from .routers_actes import router as actes_router
from .routers_admin import router as admin_router
from .routers_refs import router as refs_router     # <-- NEW
from .models_refs import ActType, Service           # <-- NEW

# Assets Swagger UI locaux
from swagger_ui_bundle import swagger_ui_3_path

import os
from pathlib import Path

app = FastAPI(
    title="TER Actes API",
    version="0.3.0",
    openapi_url="/openapi.json",
    docs_url=None,   # on fournit notre /docs custom ci-dessous
    redoc_url=None
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

# --- En-têtes de sécurité simples (adapter en prod) ---
@app.middleware("http")
async def security_headers(request: Request, call_next):
    resp = await call_next(request)
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    resp.headers.setdefault("X-Frame-Options", "DENY")
    resp.headers.setdefault("Referrer-Policy", "no-referrer")
    resp.headers.setdefault(
        "Strict-Transport-Security",
        "max-age=63072000; includeSubDomains; preload",
    )
    resp.headers.setdefault(
        "Content-Security-Policy",
        "default-src 'self'; img-src 'self' data:; "
        "style-src 'self' 'unsafe-inline'; script-src 'self'; frame-ancestors 'self'"
    )
    return resp

# --- Seed des référentiels (types/services) ---
def seed_reference_data():
    """Insère quelques valeurs par défaut si tables vides."""
    with SessionLocal() as db:
        if db.query(ActType).count() == 0:
            db.add_all([
                ActType(name="Arrêté"),
                ActType(name="Délibération"),
                ActType(name="Décision"),
                ActType(name="Autre"),
            ])
        if db.query(Service).count() == 0:
            db.add_all([
                Service(name="Mairie"),
                Service(name="Culture"),
                Service(name="Voirie"),
                Service(name="Urbanisme"),
            ])
        db.commit()

# --- DB init + création des répertoires de stockage ---
@app.on_event("startup")
def on_startup():
    # 1) schéma DB (crée aussi les nouvelles tables act_type/service)
    Base.metadata.create_all(bind=engine)

    # 2) seed référentiels si vides
    try:
        seed_reference_data()
        print("[startup] Référentiels types/services OK")
    except Exception as e:
        print(f"[startup][WARN] Seed référentiels: {e}")

    # 3) dossiers de données (ex: /data/uploads)
    #    - on privilégie settings.UPLOAD_DIR si présent, sinon variable d'env, sinon valeur par défaut.
    upload_dir = getattr(settings, "UPLOAD_DIR", None) or os.getenv("UPLOAD_DIR", "/data/uploads")
    try:
        p = Path(upload_dir)
        p.mkdir(parents=True, exist_ok=True)   # crée aussi /data si besoin
        print(f"[startup] Upload dir OK: {p.resolve()}")

        # test d'écriture (warning si RO)
        try:
            test_file = p / ".write_test"
            with open(test_file, "w") as f:
                f.write("ok")
            test_file.unlink(missing_ok=True)
        except Exception as e:
            print(f"[startup][WARN] Pas d'accès en écriture sur '{upload_dir}': {e}")

    except Exception as e:
        # On ne bloque pas le démarrage, mais on log un warning
        print(f"[startup][WARN] Impossible de créer le dossier d'upload '{upload_dir}': {e}")

# --- Routes ---
app.include_router(actes_router, prefix="")
app.include_router(admin_router, prefix="")
app.include_router(refs_router, prefix="")  # <-- endpoints /admin/types et /admin/services

# --- Swagger UI servi en local (évite la page blanche) ---
app.mount("/static", StaticFiles(directory=swagger_ui_3_path), name="static")

@app.get("/docs", include_in_schema=False)
def custom_swagger_ui():
    return get_swagger_ui_html(
        openapi_url=app.openapi_url,
        title="TER Actes API — Docs",
        swagger_js_url="/static/swagger-ui-bundle.js",
        swagger_css_url="/static/swagger-ui.css",
    )
