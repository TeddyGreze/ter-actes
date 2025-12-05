# api/app/schemas.py
from datetime import date, datetime
from typing import Optional, Literal

from pydantic import BaseModel, EmailStr, constr


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
    email: str
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


# ========== Utilisateurs (admin/agents/citoyens) ==========

# Type global possible en base
RoleType = Literal["admin", "agent", "citizen"]

# Rôles que l'interface d'administration est autorisée à attribuer
AdminRoleType = Literal["admin", "agent"]


class UserBase(BaseModel):
    id: int
    email: str
    role: RoleType

    class Config:
        from_attributes = True


class UserOut(UserBase):
    created_at: datetime


class UserCreate(BaseModel):
    # Ici on garde EmailStr pour obliger un e-mail valable pour les nouveaux comptes
    email: EmailStr
    password: constr(min_length=6)
    # Rôle par défaut : agent (admin ou agent uniquement côté admin)
    role: AdminRoleType = "agent"


class UserRoleUpdate(BaseModel):
    """
    Payload pour la mise à jour du rôle d'un utilisateur via
    PUT /admin/users/{user_id}/role (compat).
    Seuls les rôles admin/agent sont autorisés depuis l'admin.
    """
    role: AdminRoleType


class UserUpdate(BaseModel):
    """
    Payload pour la page d’édition complète :
    - email (optionnel)
    - password (optionnel, min 6 si fourni)
    - role (optionnel, admin/agent seulement via l’admin)
    Utilisé par PUT /admin/users/{user_id}.
    """
    email: Optional[EmailStr] = None
    password: Optional[constr(min_length=6)] = None
    role: Optional[AdminRoleType] = None


class AuditEntryOut(BaseModel):
    """
    Entrée du journal d'audit des actes.
    Utilisé par GET /admin/audit-logs.
    """
    id: int
    action: str
    acte_id: Optional[int] = None
    acte_titre: Optional[str] = None
    user_email: Optional[str] = None
    created_at: datetime


# Pour l'analyse du PDF envoyé dans /admin/analyse-pdf
class AnalysePDFOut(BaseModel):
    fulltext_excerpt: str
    date_auto: Optional[str] = None
    service_auto: Optional[str] = None
    type_auto: Optional[str] = None


# ====== Envoi public par e-mail d'un acte ======

class ActeEmailRequest(BaseModel):
    """
    Payload pour POST /actes/{acte_id}/email (public).
    """
    email: EmailStr


class MessageOut(BaseModel):
    """
    Réponse générique pour les actions de type "commande".
    """
    ok: bool = True
    detail: str
