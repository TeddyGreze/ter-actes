# api/app/routers_actes.py
from typing import Optional, List
from datetime import date
import os
import re

from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import select, and_, or_
from starlette.responses import FileResponse

from .database import get_db
from .models import Acte
from .schemas import ActeOut, ActeEmailRequest, MessageOut
from .config import settings
from .email_utils import send_acte_email

router = APIRouter(prefix="/actes", tags=["actes"])


def _build_front_link(acte_id: int) -> str:
    """
    Construit l'URL publique de la page /acte/[id] côté front.
    """
    base = settings.PUBLIC_FRONT_BASE_URL.rstrip("/")
    return f"{base}/acte/{acte_id}"


# =====================================================
# 1) RECHERCHE PLEIN TEXTE DANS LE CONTENU PDF (OCR)
#    GET /actes/search_fulltext?q=...
#    -> renvoie une liste de hits avec extrait de contexte
# =====================================================
@router.get("/search_fulltext", response_model=List[dict])
def search_fulltext(
    q: str = Query(..., min_length=2),
    page: int = Query(1, ge=1),
    size: int = Query(10, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """
    Recherche plein texte dans Acte.fulltext_content (indexé depuis les PDF).
    - q : mots-clés cherchés
    - pagination page/size

    Retourne une liste de {id, titre, service, date_publication, excerpt}
    Pas le PDF entier, juste un extrait autour du match.
    """

    like = f"%{q}%"
    stmt = (
        select(Acte)
        .where(Acte.fulltext_content.ilike(like))
        .order_by(
            Acte.date_publication.desc().nullslast(),
            Acte.created_at.desc(),
        )
        .offset((page - 1) * size)
        .limit(size)
    )

    actes = db.execute(stmt).scalars().all()

    results = []
    for acte in actes:
        excerpt = None
        if acte.fulltext_content:
            m = re.search(re.escape(q), acte.fulltext_content, flags=re.IGNORECASE)
            if m:
                start = max(0, m.start() - 120)
                end = min(len(acte.fulltext_content), m.end() + 120)
                snippet = acte.fulltext_content[start:end].strip()
                snippet = re.sub(r"\s+", " ", snippet)
                excerpt = snippet

        results.append({
            "id": acte.id,
            "titre": acte.titre,
            "service": acte.service,
            "date_publication": acte.date_publication,
            "excerpt": excerpt,
        })

    return results


# =====================================================
# 2) LISTE PUBLIQUE CLASSIQUE
#    GET /actes?q=...&type=... etc.
#    -> renvoie ActeOut (pas fulltext_content)
# =====================================================
@router.get("", response_model=List[ActeOut])
def list_actes(
    q: Optional[str] = None,
    type: Optional[str] = None,
    service: Optional[str] = None,
    date_min: Optional[date] = None,
    date_max: Optional[date] = None,
    page: int = 1,
    size: int = 10,
    db: Session = Depends(get_db),
):
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
        conds.append(Acte.date_publication >= date_min)

    if date_max:
        conds.append(Acte.date_publication <= date_max)

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


# =====================================================
# 3) DÉTAIL D'UN ACTE
#    GET /actes/{acte_id}
# =====================================================
@router.get("/{acte_id}", response_model=ActeOut)
def get_acte(acte_id: int, db: Session = Depends(get_db)):
    acte = db.get(Acte, acte_id)
    if not acte:
        raise HTTPException(status_code=404, detail="Not found")
    return acte


# =====================================================
# 4) RÉCUP PDF
#    GET /actes/{acte_id}/pdf
# =====================================================
@router.get("/{acte_id}/pdf")
def get_pdf(acte_id: int, db: Session = Depends(get_db)):
    """
    Renvoie le PDF avec :
    - Content-Disposition pour forcer le bon nom de fichier
    - Access-Control-Expose-Headers pour que le front
      puisse LIRE cet header et renommer le téléchargement.
    """
    acte = db.get(Acte, acte_id)
    if not acte:
        raise HTTPException(status_code=404, detail="Not found")

    raw_name = os.path.basename(acte.pdf_path)  # ex: "MonActe.pdf"
    safe_name = raw_name.replace('"', '')

    return FileResponse(
        acte.pdf_path,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{safe_name}"',
            "Access-Control-Expose-Headers": "Content-Disposition",
        },
    )


# =====================================================
# 5) ENVOI PUBLIC PAR E-MAIL
#    POST /actes/{acte_id}/email
# =====================================================
@router.post("/{acte_id}/email", response_model=MessageOut)
def send_acte_by_email_public(
    acte_id: int,
    payload: ActeEmailRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """
    Envoi PUBLIC d'un acte par e-mail.

    - accessible sans authentification
    - payload JSON: { "email": "destinataire@domaine.fr" }
    - l'e-mail contient :
        * un lien vers la page publique de l'acte
        * + le PDF en pièce jointe
    """
    acte = db.get(Acte, acte_id)
    if not acte:
        raise HTTPException(status_code=404, detail="Not found")

    if not acte.pdf_path:
        raise HTTPException(
            status_code=400,
            detail="Aucun fichier PDF n'est associé à cet acte.",
        )

    # URL publique vers la page de l'acte
    link = _build_front_link(acte_id)

    # Envoi en tâche de fond : la requête HTTP répond tout de suite
    background_tasks.add_task(
        send_acte_email,
        to_email=payload.email,
        acte_title=acte.titre,
        link_url=link,
        pdf_path=acte.pdf_path,
    )

    return MessageOut(
        ok=True,
        detail="E-mail envoyé. Pensez à vérifier vos spams.",
    )
