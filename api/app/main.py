# api/app/main.py
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.staticfiles import StaticFiles

from .database import Base, engine, SessionLocal  # SessionLocal pour seed + SQL brut
from .config import settings
from .routers_actes import router as actes_router
from .routers_admin import router as admin_router
from .routers_refs import router as refs_router
from .models_refs import ActType, Service

# Assets Swagger UI locaux
from swagger_ui_bundle import swagger_ui_3_path

import os
from pathlib import Path
from sqlalchemy import text  # <-- pour exécuter du SQL brut


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


# --- Migration auto "maison" pour ajouter la colonne fulltext_content ---
def _ensure_fulltext_column():
    """
    On s'assure que la colonne actes.fulltext_content existe.
    Si elle n'existe pas, on l'ajoute.
    Pas besoin d'intervenir manuellement dans Postgres 🙂
    """
    ddl = text("""
        ALTER TABLE actes
        ADD COLUMN IF NOT EXISTS fulltext_content TEXT;
    """)
    with engine.begin() as conn:
        conn.execute(ddl)


# --- DB init + création des répertoires de stockage ---
@app.on_event("startup")
def on_startup():
    # 1) crée les tables connues par SQLAlchemy si elles n'existent pas encore
    Base.metadata.create_all(bind=engine)

    # 2) applique notre "migration légère" : ajoute la colonne fulltext_content si besoin
    try:
        _ensure_fulltext_column()
        print("[startup] Colonne fulltext_content OK")
    except Exception as e:
        print(f"[startup][WARN] Impossible d'ajouter/valider fulltext_content: {e}")

    # 3) seed référentiels si vides
    try:
        seed_reference_data()
        print("[startup] Référentiels types/services OK")
    except Exception as e:
        print(f"[startup][WARN] Seed référentiels: {e}")

    # 4) dossiers de données (ex: /data/uploads)
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
        print(f"[startup][WARN] Impossible de créer le dossier d'upload '{upload_dir}': {e}")


# --- Routes ---
app.include_router(actes_router, prefix="")
app.include_router(admin_router, prefix="")
app.include_router(refs_router, prefix="")  # /admin/types /admin/services pour le front


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
