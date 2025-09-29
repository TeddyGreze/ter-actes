from datetime import datetime, timedelta
from typing import Optional, List

import os
from pathlib import Path

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    UploadFile,
    File,
    Form,
    Response,
    status,
    Query,
)
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select, and_, or_
from sqlalchemy.orm import Session

from .config import settings
from .database import get_db
from .models import Acte, User
from .schemas import TokenOut, ActeOut
from .auth import (
    get_password_hash,
    verify_password,
    create_access_token,
    get_current_user,
)
from .utils import save_pdf_validated

router = APIRouter(prefix="/admin", tags=["admin"])


# ---------- Helpers ----------
def ensure_admin(db: Session):
    """Crée l’utilisateur admin s’il n’existe pas encore."""
    user = db.query(User).filter(User.email == settings.ADMIN_EMAIL).first()
    if not user:
        user = User(
            email=settings.ADMIN_EMAIL,
            password_hash=get_password_hash(settings.ADMIN_PASSWORD),
            role="admin",
        )
        db.add(user)
        db.commit()


def _parse_date(s: Optional[str]):
    if not s:
        return None
    return datetime.fromisoformat(s).date()


def _delete_file_if_exists(path_str: Optional[str]):
    if not path_str:
        return
    try:
        p = Path(path_str)
        if p.exists():
            p.unlink(missing_ok=True)
    except Exception:
        # on ignore en cas d'échec de suppression disque
        pass


# ---------- Auth ----------
@router.post("/login", response_model=TokenOut)
def login(
    response: Response,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    """
    Connexion admin :
    - vérifie identifiants
    - génère un JWT
    - pose un cookie HttpOnly 'access_token'
    - renvoie aussi le token (utile si tu veux Authorization côté front)
    """
    ensure_admin(db)

    user = db.query(User).filter(User.email == form_data.username).first()
    if not user or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(status_code=400, detail="Incorrect email or password")

    expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    token = create_access_token({"sub": user.email}, expires_delta=expires)

    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        samesite="lax",
        secure=False,  # True en prod (HTTPS)
        max_age=int(expires.total_seconds()),
        path="/",
    )
    return {"access_token": token, "token_type": "bearer"}


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response, user=Depends(get_current_user)):
    """Supprime le cookie d’auth."""
    response.delete_cookie("access_token", path="/")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/me", response_model=dict)
def me(user=Depends(get_current_user)):
    """Ping d’auth simple pour le front."""
    return {"email": user.email, "role": getattr(user, "role", "user")}


# ---------- Admin : CRUD Actes ----------
@router.get("/actes", response_model=List[ActeOut])
def admin_list_actes(
    q: Optional[str] = Query(default=None),
    type: Optional[str] = Query(default=None),
    service: Optional[str] = Query(default=None),
    date_min: Optional[str] = Query(default=None),
    date_max: Optional[str] = Query(default=None),
    page: int = Query(default=1, ge=1),
    size: int = Query(default=10, ge=1, le=100),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """Liste des actes (protégée) avec filtres/pagination."""
    stmt = select(Acte)
    conds = []
    if q:
        like = f"%{q}%"
        conds.append(or_(Acte.titre.ilike(like), Acte.resume.ilike(like)))
    if type:
        conds.append(Acte.type == type)
    if service:
        conds.append(Acte.service == service)
    if date_min:
        conds.append(Acte.date_publication >= _parse_date(date_min))
    if date_max:
        conds.append(Acte.date_publication <= _parse_date(date_max))
    if conds:
        stmt = stmt.where(and_(*conds))

    stmt = (
        stmt.order_by(
            Acte.date_publication.desc().nullslast(),
            Acte.created_at.desc(),
        )
        .offset((page - 1) * size)
        .limit(size)
    )
    rows = db.execute(stmt).scalars().all()
    return rows


@router.put("/actes/{acte_id}", response_model=ActeOut)
async def admin_update_acte(
    acte_id: int,
    titre: Optional[str] = Form(None),
    type: Optional[str] = Form(None),
    service: Optional[str] = Form(None),
    date_signature: Optional[str] = Form(None),
    date_publication: Optional[str] = Form(None),
    statut: Optional[str] = Form(None),
    resume: Optional[str] = Form(None),
    pdf: UploadFile = File(None),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """Mise à jour d’un acte (champs optionnels, PDF optionnel)."""
    acte = db.get(Acte, acte_id)
    if not acte:
        raise HTTPException(status_code=404, detail="Not found")

    if titre is not None:
        acte.titre = titre
    if type is not None:
        acte.type = type
    if service is not None:
        acte.service = service
    if statut is not None:
        acte.statut = statut
    if resume is not None:
        acte.resume = resume
    if date_signature is not None:
        acte.date_signature = _parse_date(date_signature)
    if date_publication is not None:
        acte.date_publication = _parse_date(date_publication)

    if pdf is not None:
        # remplace le fichier
        new_path = await save_pdf_validated(settings.UPLOAD_DIR, pdf)
        # supprime l'ancien si présent
        _delete_file_if_exists(acte.pdf_path)
        acte.pdf_path = new_path

    db.add(acte)
    db.commit()
    db.refresh(acte)
    return acte


@router.delete("/actes/{acte_id}", status_code=status.HTTP_204_NO_CONTENT)
def admin_delete_acte(
    acte_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """Suppression d’un acte + fichier local."""
    acte = db.get(Acte, acte_id)
    if not acte:
        raise HTTPException(status_code=404, detail="Not found")

    # supprime le fichier PDF du disque si possible
    _delete_file_if_exists(acte.pdf_path)

    db.delete(acte)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ----------- Upload (création) -----------
@router.post("/actes", response_model=dict)
async def create_acte_one_shot(
    titre: str = Form(...),
    type: Optional[str] = Form(None),
    service: Optional[str] = Form(None),
    date_signature: Optional[str] = Form(None),
    date_publication: Optional[str] = Form(None),
    statut: Optional[str] = Form(None),
    resume: Optional[str] = Form(None),
    pdf: UploadFile = File(...),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """Création d’un acte (protégé)."""
    path = await save_pdf_validated(settings.UPLOAD_DIR, pdf)

    acte = Acte(
        titre=titre,
        type=type,
        service=service,
        date_signature=_parse_date(date_signature),
        date_publication=_parse_date(date_publication),
        statut=statut,
        resume=resume,
        pdf_path=path,
    )
    db.add(acte)
    db.commit()
    db.refresh(acte)
    return {"id": acte.id, "detail": "created"}
