from typing import Optional, List
from datetime import date
import os
import re

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import select, and_, or_, func
from starlette.responses import FileResponse

from .database import get_db
from .models import Acte
from .schemas import ActeOut

router = APIRouter(prefix="/actes", tags=["actes"])


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

    # filtre SQL côté DB (case-insensitive)
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
            # essaie de trouver ta chaîne dans le texte pour fabriquer un mini-contexte
            m = re.search(re.escape(q), acte.fulltext_content, flags=re.IGNORECASE)
            if m:
                start = max(0, m.start() - 120)
                end = min(len(acte.fulltext_content), m.end() + 120)
                snippet = acte.fulltext_content[start:end].strip()

                # remplace les retours à la ligne multiples par des espaces
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
