# api/app/routers_admin.py
from datetime import datetime, timedelta
from typing import Optional, List

from pathlib import Path
import json
import io
import csv

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
from fastapi.responses import StreamingResponse
# OAuth2PasswordRequestForm.username = email
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select, and_, or_
from sqlalchemy.orm import Session
from pydantic import BaseModel, ValidationError

from .config import settings
from .database import get_db
from .models import Acte, User, AuditLog
from .models_refs import ActType, Service
from .schemas import (
    TokenOut,
    ActeOut,
    AnalysePDFOut,
    UserOut,
    UserCreate,
    UserRoleUpdate,
    UserUpdate,
    AuditEntryOut,
)
from .auth import (
    get_password_hash,
    verify_password,
    create_access_token,
    get_current_user,
    require_admin,
)
from .utils import save_pdf_validated
from .pdf_utils import (
    extract_text_with_ocr_if_needed,
    guess_metadata_from_text,
)

router = APIRouter(prefix="/admin", tags=["admin"])


# ---------- Helpers ----------


def ensure_admin(db: Session):
    """Crée l’utilisateur admin par défaut s’il n’existe pas encore."""
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
    """
    Accepte :
      - JJ/MM/AAAA
      - JJ/MM/AA (devient JJ/MM/20AA)
      - AAAA-MM-JJ (format HTML <input type="date">)
    """
    if not s:
        return None
    s = s.strip()
    try:
        if "/" in s:
            parts = s.split("/")
            if len(parts) != 3:
                raise ValueError("format inattendu")
            d_str, m_str, y_str = [p.strip() for p in parts]
            d = int(d_str)
            m = int(m_str)
            if len(y_str) == 2:
                # JJ/MM/AA -> JJ/MM/20AA
                y = 2000 + int(y_str)
            else:
                y = int(y_str)
            return datetime(year=y, month=m, day=d).date()

        # Sinon on suppose un format ISO AAAA-MM-JJ
        return datetime.fromisoformat(s).date()
    except ValueError as e:
        raise ValueError(
            f"Format de date invalide: {s}. Attendu JJ/MM/AAAA, JJ/MM/AA ou AAAA-MM-JJ."
        ) from e


def _delete_file_if_exists(path_str: Optional[str]):
    if not path_str:
        return
    try:
        p = Path(path_str)
        if p.exists():
            p.unlink(missing_ok=True)
    except Exception:
        # on ignore si ça échoue
        pass


def _auto_metadata_from_text(text: str, db: Session):
    """
    Utilise les listes officielles (ActType / Service) pour essayer
    de retrouver ce qui matche dans le PDF.
    Renvoie (date_auto, service_auto, type_auto).
    """
    known_types = [row.name for row in db.query(ActType).all()]
    known_services = [row.name for row in db.query(Service).all()]

    date_auto, service_auto, type_auto = guess_metadata_from_text(
        text,
        known_services=known_services,
        known_types=known_types,
    )
    return date_auto, service_auto, type_auto


def _log_acte_action(
    db: Session,
    *,
    acte: Optional[Acte],
    user,
    action: str,
    detail: Optional[str] = None,
):
    """
    Enregistre une entrée dans le journal d'audit pour un acte.
    - action : "create", "update", "delete"
    """
    log = AuditLog(
        acte_id=acte.id if acte is not None else None,
        user_id=getattr(user, "id", None),
        action=action,
        detail=detail,
    )
    db.add(log)


class BulkActeCreate(BaseModel):
    """
    Données d’un acte pour la création multiple.
    """
    titre: str
    type: Optional[str] = None
    service: Optional[str] = None
    date_signature: Optional[str] = None   # "JJ/MM/AAAA", "JJ/MM/AA" ou "AAAA-MM-JJ"
    date_publication: Optional[str] = None


# ---------- Auth ----------


@router.post("/login", response_model=TokenOut)
def login(
    response: Response,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    """
    Authentifie l’admin :
    - vérifie email/mdp
    - génère un JWT
    - met le JWT dans un cookie HttpOnly
    """
    ensure_admin(db)

    # username = email
    user = db.query(User).filter(User.email == form_data.username).first()
    if not user or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(status_code=400, detail="Incorrect email or password")

    expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    # On encode le rôle dans le token
    token = create_access_token(
        {"sub": user.email, "role": user.role},
        expires_delta=expires,
    )

    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        samesite="lax",
        secure=False,  # True en prod HTTPS
        max_age=int(expires.total_seconds()),
        path="/",
    )
    return {"access_token": token, "token_type": "bearer"}


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response, user=Depends(get_current_user)):
    """Déconnexion admin : supprime le cookie d’auth."""
    response.delete_cookie("access_token", path="/")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/me", response_model=dict)
def me(user=Depends(get_current_user)):
    """Ping d’auth côté front admin pour vérifier la session."""
    return {"email": user.email, "role": getattr(user, "role", "user")}


# ---------- Analyse PDF (pré-remplissage formulaire upload) ----------


@router.post("/analyse-pdf", response_model=AnalysePDFOut)
async def analyse_pdf(
    pdf: UploadFile = File(...),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """
    Reçoit un PDF temporaire (pas encore enregistré en base),
    fait extraction texte + OCR si besoin, et tente de détecter :
      - date_auto
      - service_auto
      - type_auto

    Renvoie aussi un extrait du texte (fulltext_excerpt) juste pour debug.
    """

    # 1. lire le binaire pour OCR
    raw_bytes = await pdf.read()
    pdf.file.seek(0)

    # 2. extraire le texte (OCR fallback)
    txt = extract_text_with_ocr_if_needed(raw_bytes)

    # 3. deviner quelques métadonnées
    date_auto, service_auto, type_auto = _auto_metadata_from_text(txt, db)

    return AnalysePDFOut(
        fulltext_excerpt=txt[:2000],
        date_auto=date_auto,
        service_auto=service_auto,
        type_auto=type_auto,
    )


# ---------- Ajout multiple (formulaire multi-PDF) ----------


@router.post("/actes/bulk", response_model=dict)
async def admin_create_actes_bulk(
    items: str = Form(...),                      # JSON string [{...}, {...}]
    files: List[UploadFile] = File(default=[]),  # liste de PDF (un par ligne)
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """
    Création en masse d'actes à partir du formulaire multi-upload.
    - items : JSON d'une liste de BulkActeCreate
    - files : liste de PDF alignés avec les items (index 0 -> acte #1, etc.)
    """
    try:
        raw_items = json.loads(items)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Champ 'items' invalide (JSON attendu).")

    if not isinstance(raw_items, list) or len(raw_items) == 0:
        raise HTTPException(status_code=400, detail="'items' doit être une liste non vide.")

    actes_data: List[BulkActeCreate] = []
    for idx, obj in enumerate(raw_items):
        try:
            actes_data.append(BulkActeCreate(**obj))
        except ValidationError as e:
            raise HTTPException(
                status_code=400,
                detail=f"Ligne {idx + 1} invalide dans 'items': {e.errors()}",
            )

    created_ids: List[int] = []

    # pour chaque entrée, on crée un Acte comme dans create_acte_one_shot
    for i, data in enumerate(actes_data):
        if i >= len(files) or files[i] is None:
            raise HTTPException(status_code=400, detail=f"PDF manquant pour l'acte #{i + 1}.")
        pdf = files[i]

        # lire les bytes pour OCR
        raw_bytes = await pdf.read()
        pdf.file.seek(0)

        # sauvegarder le PDF sur disque
        path = await save_pdf_validated(settings.UPLOAD_DIR, pdf)

        # génère le texte intégral : texte natif ou OCR
        fulltxt = extract_text_with_ocr_if_needed(raw_bytes)

        try:
            ds = _parse_date(data.date_signature)
            dp = _parse_date(data.date_publication)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Date invalide pour l'acte #{i + 1} "
                    "(format attendu JJ/MM/AAAA, JJ/MM/AA ou AAAA-MM-JJ)."
                ),
            )

        acte = Acte(
            titre=data.titre,
            type=data.type,
            service=data.service,
            date_signature=ds,
            date_publication=dp,
            pdf_path=path,
            fulltext_content=fulltxt,
        )
        db.add(acte)
        db.flush()   # pour récupérer l'id sans commit à chaque fois

        # journal d'audit : création via upload multiple
        _log_acte_action(
            db,
            acte=acte,
            user=user,
            action="create",
            detail="Création via upload multiple",
        )

        created_ids.append(acte.id)

    db.commit()

    return {
        "detail": "created",
        "count": len(created_ids),
        "created": created_ids,
    }


# ---------- Admin : CRUD Actes (classique) ----------


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
    """
    Liste paginée des actes côté admin.
    Filtres classiques + recherche sur fulltext_content (OCR).
    """
    stmt = select(Acte)

    conds = []
    if q:
        like = f"%{q}%"
        conds.append(
            or_(
                Acte.titre.ilike(like),
                Acte.resume.ilike(like),
                Acte.fulltext_content.ilike(like),
            )
        )
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


@router.post("/actes", response_model=dict)
async def create_acte_one_shot(
    titre: str = Form(...),
    type: Optional[str] = Form(None),
    service: Optional[str] = Form(None),
    date_signature: Optional[str] = Form(None),
    date_publication: Optional[str] = Form(None),
    pdf: UploadFile = File(...),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """
    Création d’un acte :
    - sauvegarde le PDF sur disque
    - OCR/parse le PDF pour avoir fulltext_content
    - stocke tout en base
    """

    # lire les bytes pour OCR
    raw_bytes = await pdf.read()
    pdf.file.seek(0)

    # sauvegarder le PDF sur disque
    path = await save_pdf_validated(settings.UPLOAD_DIR, pdf)

    # génère le texte intégral : texte natif ou OCR
    fulltxt = extract_text_with_ocr_if_needed(raw_bytes)

    acte = Acte(
        titre=titre,
        type=type,
        service=service,
        date_signature=_parse_date(date_signature),
        date_publication=_parse_date(date_publication),
        pdf_path=path,
        fulltext_content=fulltxt,
    )

    db.add(acte)
    db.flush()  # pour avoir acte.id avant le commit

    # journal d'audit : création depuis le formulaire simple
    _log_acte_action(
        db,
        acte=acte,
        user=user,
        action="create",
        detail="Création depuis le formulaire simple",
    )

    db.commit()
    db.refresh(acte)
    return {"id": acte.id, "detail": "created"}


@router.put("/actes/{acte_id}", response_model=ActeOut)
async def admin_update_acte(
    acte_id: int,
    titre: Optional[str] = Form(None),
    type: Optional[str] = Form(None),
    service: Optional[str] = Form(None),
    date_signature: Optional[str] = Form(None),
    date_publication: Optional[str] = Form(None),
    pdf: UploadFile = File(None),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """
    Mise à jour d’un acte existant.
    Si un nouveau PDF est fourni :
    - remplace le fichier PDF sur disque
    - refait l’OCR pour mettre à jour fulltext_content
    """
    acte = db.get(Acte, acte_id)
    if not acte:
        raise HTTPException(status_code=404, detail="Not found")

    if titre is not None:
        acte.titre = titre
    if type is not None:
        acte.type = type
    if service is not None:
        acte.service = service
    if date_signature is not None:
        acte.date_signature = _parse_date(date_signature)
    if date_publication is not None:
        acte.date_publication = _parse_date(date_publication)

    if pdf is not None:
        # lire les bytes pour OCR
        raw_bytes = await pdf.read()
        pdf.file.seek(0)

        # sauvegarder le nouveau fichier
        new_path = await save_pdf_validated(settings.UPLOAD_DIR, pdf)

        # supprimer l'ancien fichier du disque
        _delete_file_if_exists(acte.pdf_path)

        acte.pdf_path = new_path

        # regénérer fulltext_content
        fulltxt = extract_text_with_ocr_if_needed(raw_bytes)
        acte.fulltext_content = fulltxt

    # journal d'audit : mise à jour
    _log_acte_action(
        db,
        acte=acte,
        user=user,
        action="update",
        detail="Mise à jour des métadonnées ou du PDF",
    )

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
    """
    Suppression d’un acte + son PDF sur le disque.
    """
    acte = db.get(Acte, acte_id)
    if not acte:
        raise HTTPException(status_code=404, detail="Not found")

    # journal d'audit : suppression
    _log_acte_action(
        db,
        acte=acte,
        user=user,
        action="delete",
        detail="Suppression de l'acte",
    )

    _delete_file_if_exists(acte.pdf_path)

    db.delete(acte)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------- Journal d'audit (Admin only) ----------


@router.get("/audit", response_model=List[AuditEntryOut])
@router.get("/audit-logs", response_model=List[AuditEntryOut])
def list_audit_logs_admin(
    user_email: Optional[str] = Query(default=None),
    action: Optional[str] = Query(default=None),
    acte_id: Optional[int] = Query(default=None),
    page: int = Query(default=1, ge=1),
    size: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    admin=Depends(require_admin),
):
    """
    Consultation du journal d'audit des actes :
    qui a créé / modifié / supprimé quel acte, et quand.
    Filtres possibles :
      - user_email : filtre sur l'e-mail de l'agent/admin
      - action : "create" / "update" / "delete"
      - acte_id : id de l'acte concerné
    Réservé aux administrateurs.
    """
    stmt = (
        select(AuditLog, Acte.titre, User.email)
        .outerjoin(Acte, AuditLog.acte_id == Acte.id)
        .outerjoin(User, AuditLog.user_id == User.id)
    )

    conds = []
    if user_email:
        like = f"%{user_email}%"
        conds.append(User.email.ilike(like))
    if action:
        conds.append(AuditLog.action == action)
    if acte_id is not None:
        conds.append(AuditLog.acte_id == acte_id)

    if conds:
        stmt = stmt.where(and_(*conds))

    stmt = (
        stmt.order_by(AuditLog.created_at.desc())
        .offset((page - 1) * size)
        .limit(size)
    )

    rows = db.execute(stmt).all()

    entries: List[AuditEntryOut] = []
    for log, acte_titre, email in rows:
        entries.append(
            AuditEntryOut(
                id=log.id,
                action=log.action,
                acte_id=log.acte_id,
                acte_titre=acte_titre,
                user_email=email,
                created_at=log.created_at,
            )
        )

    return entries


@router.get("/audit-logs/export")
def export_audit_logs_admin(
    user_email: Optional[str] = Query(default=None),
    action: Optional[str] = Query(default=None),
    acte_id: Optional[int] = Query(default=None),
    db: Session = Depends(get_db),
    admin=Depends(require_admin),
):
    """
    Export du journal d'audit au format CSV.
    Les mêmes filtres que /admin/audit-logs sont disponibles, mais
    l'export ne tient pas compte de la pagination (toutes les lignes
    correspondant aux filtres, avec une limite de sécurité).
    """
    MAX_ROWS = 10_000

    stmt = (
        select(AuditLog, Acte.titre, User.email)
        .outerjoin(Acte, AuditLog.acte_id == Acte.id)
        .outerjoin(User, AuditLog.user_id == User.id)
    )

    conds = []
    if user_email:
        like = f"%{user_email}%"
        conds.append(User.email.ilike(like))
    if action:
        conds.append(AuditLog.action == action)
    if acte_id is not None:
        conds.append(AuditLog.acte_id == acte_id)

    if conds:
        stmt = stmt.where(and_(*conds))

    stmt = stmt.order_by(AuditLog.created_at.desc()).limit(MAX_ROWS)

    rows = db.execute(stmt).all()

    # Génération du CSV en mémoire
    buffer = io.StringIO()
    writer = csv.writer(buffer, delimiter=';')

    # En-têtes
    writer.writerow(
        ["id", "timestamp", "user_email", "action", "acte_id", "acte_titre", "detail"]
    )

    for log, acte_titre, email in rows:
        ts = log.created_at.isoformat(timespec="seconds") if log.created_at else ""
        writer.writerow(
            [
                log.id,
                ts,
                email or "",
                log.action,
                log.acte_id if log.acte_id is not None else "",
                acte_titre or "",
                log.detail or "",
            ]
        )

    buffer.seek(0)
    filename = "audit_logs.csv"

    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"'
        },
    )


# ---------- Gestion des utilisateurs (Admin only) ----------

@router.get("/users", response_model=List[UserOut])
def list_users_admin(
    db: Session = Depends(get_db),
    admin=Depends(require_admin),
):
    """
    Liste des utilisateurs (admins et agents).
    Réservé aux administrateurs.
    """
    users = db.query(User).order_by(User.created_at.desc()).all()
    return users


@router.post("/users", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user_admin(
    payload: UserCreate,
    db: Session = Depends(get_db),
    admin=Depends(require_admin),
):
    """
    Création d'un utilisateur (admin ou agent) par un administrateur.
    """
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(
            status_code=400,
            detail="Un utilisateur avec cet e-mail existe déjà.",
        )

    user = User(
        email=payload.email,
        password_hash=get_password_hash(payload.password),
        role=payload.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.get("/users/{user_id}", response_model=UserOut)
def get_user_admin(
    user_id: int,
    db: Session = Depends(get_db),
    admin=Depends(require_admin),
):
    """
    Récupère un utilisateur par son id (pour la page d'édition).
    """
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Utilisateur introuvable.",
        )
    return user


@router.put("/users/{user_id}", response_model=UserOut)
def update_user_admin(
    user_id: int,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    admin=Depends(require_admin),
):
    """
    Mise à jour complète d'un utilisateur (email, mot de passe, rôle).
    - email : vérifie l'unicité si changé
    - password : si fourni, on régénère le hash
    - role : si fourni, interdit de changer son propre rôle
    """
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Utilisateur introuvable.",
        )

    # email
    if payload.email is not None and payload.email != user.email:
        existing = (
            db.query(User)
            .filter(User.email == payload.email, User.id != user_id)
            .first()
        )
        if existing:
            raise HTTPException(
                status_code=400,
                detail="Un utilisateur avec cet e-mail existe déjà.",
            )
        user.email = payload.email

    # mot de passe
    if payload.password is not None:
        user.password_hash = get_password_hash(payload.password)

    # rôle (on ne change pas son propre rôle)
    if payload.role is not None and payload.role != user.role:
        if admin.id == user.id:
            raise HTTPException(
                status_code=400,
                detail="Vous ne pouvez pas modifier votre propre rôle.",
            )
        user.role = payload.role

    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.put("/users/{user_id}/role", response_model=UserOut)
def update_user_role_admin(
    user_id: int,
    payload: UserRoleUpdate,
    db: Session = Depends(get_db),
    admin=Depends(require_admin),
):
    """
    Mise à jour du rôle d'un utilisateur (admin uniquement).
    Gardé pour compatibilité, même si la page d'édition utilise maintenant
    PUT /admin/users/{id}. Seuls les rôles admin/agent sont acceptés.
    """
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Utilisateur introuvable.",
        )

    if admin.id == user.id:
        raise HTTPException(
            status_code=400,
            detail="Vous ne pouvez pas modifier votre propre rôle.",
        )

    user.role = payload.role
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user_admin(
    user_id: int,
    db: Session = Depends(get_db),
    admin=Depends(require_admin),
):
    """
    Suppression d'un utilisateur (admin uniquement).
    On interdit de supprimer son propre compte.
    """
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Utilisateur introuvable.",
        )

    if user.id == admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Vous ne pouvez pas supprimer votre propre compte.",
        )

    db.delete(user)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
