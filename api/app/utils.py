import os
from pathlib import Path
from fastapi import UploadFile, HTTPException
from .config import settings

PDF_MAGIC = b"%PDF-"

def ensure_dir(path: str):
    Path(path).mkdir(parents=True, exist_ok=True)

async def save_pdf_validated(upload_dir: str, file: UploadFile) -> str:
    # Vérif rapide MIME/extension
    if file.content_type not in ("application/pdf", "application/x-pdf") and not (file.filename or "").lower().endswith(".pdf"):
        raise HTTPException(status_code=415, detail="Only PDF files are allowed")

    ensure_dir(upload_dir)

    # Nom unique
    filename = file.filename or "document.pdf"
    base, ext = os.path.splitext(filename)
    if ext.lower() != ".pdf":
        ext = ".pdf"
    final = base + ext
    i = 1
    while os.path.exists(os.path.join(upload_dir, final)):
        final = f"{base}_{i}{ext}"
        i += 1
    dest_path = os.path.join(upload_dir, final)

    max_bytes = int(settings.MAX_UPLOAD_MB) * 1024 * 1024
    total = 0

    with open(dest_path, "wb") as out:
        first = await file.read(1024)
        total += len(first)
        if not first.startswith(PDF_MAGIC):
            out.close()
            os.remove(dest_path)
            raise HTTPException(status_code=415, detail="Invalid PDF signature")
        out.write(first)

        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            total += len(chunk)
            if total > max_bytes:
                out.close()
                os.remove(dest_path)
                raise HTTPException(status_code=413, detail=f"File too large (>{settings.MAX_UPLOAD_MB} MB)")
            out.write(chunk)

    return dest_path
