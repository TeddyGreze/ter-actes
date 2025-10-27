from pydantic import BaseModel, EmailStr
from datetime import date, datetime
from typing import Optional


class ActeBase(BaseModel):
    titre: str
    type: Optional[str] = None
    service: Optional[str] = None
    date_signature: Optional[date] = None
    date_publication: Optional[date] = None
    statut: Optional[str] = None
    resume: Optional[str] = None


class ActeCreate(ActeBase):
    pass


class ActeOut(ActeBase):
    id: int
    pdf_path: str
    created_at: datetime

    class Config:
        from_attributes = True


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


# Pour l'analyse à chaud du PDF envoyé dans /admin/analyse-pdf
class AnalysePDFOut(BaseModel):
    fulltext_excerpt: str
    date_auto: Optional[str] = None
    service_auto: Optional[str] = None
    type_auto: Optional[str] = None
