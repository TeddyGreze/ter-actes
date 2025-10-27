FROM python:3.11-slim

WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# dépendances système :
# - build-essential libpq-dev -> psycopg / compilation
# - tesseract-ocr + tesseract-ocr-fra -> OCR texte scanné (FR)
# - poppler-utils -> pdf2image (pdftoppm / pdftocairo)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    tesseract-ocr \
    tesseract-ocr-fra \
    poppler-utils \
    && rm -rf /var/lib/apt/lists/*

# on copie les deps Python et on installe
COPY requirements.txt /app/requirements.txt
ENV PIP_DEFAULT_TIMEOUT=120 PIP_DISABLE_PIP_VERSION_CHECK=1
RUN pip install --no-cache-dir --retries 3 -r /app/requirements.txt

# on copie le code de l'API
COPY app /app/app

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
