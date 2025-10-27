from sqlalchemy import Column, Integer, String, Date, DateTime, Text
from sqlalchemy.sql import func
from .database import Base

class Acte(Base):
    __tablename__ = "actes"

    id = Column(Integer, primary_key=True, index=True)

    titre = Column(String(255), nullable=False, index=True)
    type = Column(String(50), nullable=True, index=True)
    service = Column(String(100), nullable=True, index=True)
    date_signature = Column(Date, nullable=True, index=True)
    date_publication = Column(Date, nullable=True, index=True)
    statut = Column(String(50), nullable=True, index=True)
    resume = Column(Text, nullable=True)

    pdf_path = Column(String(512), nullable=False)

    # Texte intégral (OCR ou texte natif du PDF)
    fulltext_content = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(50), nullable=False, default="admin")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
