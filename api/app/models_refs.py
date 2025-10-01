# api/app/models_refs.py
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Integer
from .database import Base

class ActType(Base):
    __tablename__ = "act_type"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True, index=True, nullable=False)

class Service(Base):
    __tablename__ = "service"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(160), unique=True, index=True, nullable=False)
