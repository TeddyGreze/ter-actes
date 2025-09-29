# api/app/main.py
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.staticfiles import StaticFiles

from .database import Base, engine
from .config import settings
from .routers_actes import router as actes_router
from .routers_admin import router as admin_router

# Assets Swagger UI locaux
from swagger_ui_bundle import swagger_ui_3_path

app = FastAPI(
    title="TER Actes API",
    version="0.2.0",
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

# --- DB init ---
@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)

# --- Routes ---
app.include_router(actes_router, prefix="")
app.include_router(admin_router, prefix="")

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
