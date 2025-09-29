from datetime import datetime, timedelta
from typing import Optional

from fastapi import Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from .config import settings
from .database import get_db
from .models import User

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# auto_error=False pour pouvoir tomber en fallback cookie si pas d'en-tête
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/admin/login", auto_error=False)

ALGORITHM = "HS256"


def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password):
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    expire = datetime.utcnow() + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=ALGORITHM)


def _normalize_bearer(value: Optional[str]) -> Optional[str]:
    """Supprime le préfixe 'Bearer ' si présent."""
    if not value:
        return value
    if value.startswith("Bearer "):
        return value[7:]
    return value


def get_current_user(
    request: Request,
    token: Optional[str] = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    """
    Authentifie l'utilisateur à partir :
      1) de l'en-tête Authorization: Bearer <token>, si présent
      2) sinon, du cookie 'access_token'
    """
    # 1) En-tête Authorization (si fourni)
    token = _normalize_bearer(token)

    # 2) Fallback cookie
    if not token:
        cookie_token = request.cookies.get("access_token")
        token = _normalize_bearer(cookie_token)

    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if not token:
        # ni en-tête ni cookie → non authentifié
        raise credentials_exception

    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
        email: Optional[str] = payload.get("sub")
        if email is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = db.query(User).filter(User.email == email).first()
    if user is None:
        raise credentials_exception
    return user
