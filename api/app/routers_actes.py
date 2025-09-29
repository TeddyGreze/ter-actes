from typing import Optional, List
from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select, and_, or_
from starlette.responses import FileResponse
from .database import get_db
from .models import Acte
from .schemas import ActeOut

router = APIRouter(prefix="/actes", tags=["actes"])

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
    stmt = stmt.order_by(Acte.date_publication.desc().nullslast(), Acte.created_at.desc()).offset((page-1)*size).limit(size)
    rows = db.execute(stmt).scalars().all()
    return rows

@router.get("/{acte_id}", response_model=ActeOut)
def get_acte(acte_id: int, db: Session = Depends(get_db)):
    acte = db.get(Acte, acte_id)
    if not acte:
        raise HTTPException(status_code=404, detail="Not found")
    return acte

@router.get("/{acte_id}/pdf")
def get_pdf(acte_id: int, db: Session = Depends(get_db)):
    acte = db.get(Acte, acte_id)
    if not acte:
        raise HTTPException(status_code=404, detail="Not found")
    return FileResponse(acte.pdf_path, media_type="application/pdf")
