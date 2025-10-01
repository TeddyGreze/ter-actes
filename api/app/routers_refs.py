# api/app/routers_refs.py
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from .database import get_db
from .models_refs import ActType, Service

router = APIRouter(prefix="/admin", tags=["refs"])

class RefOut(BaseModel):
    id: int
    name: str

@router.get("/types", response_model=list[RefOut])
def list_types(db: Session = Depends(get_db)):
    rows = db.query(ActType).order_by(ActType.name.asc()).all()
    return [{"id": r.id, "name": r.name} for r in rows]

@router.get("/services", response_model=list[RefOut])
def list_services(db: Session = Depends(get_db)):
    rows = db.query(Service).order_by(Service.name.asc()).all()
    return [{"id": r.id, "name": r.name} for r in rows]
