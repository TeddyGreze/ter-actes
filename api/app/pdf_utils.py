# app/pdf_utils.py
from typing import Optional, List, Tuple
import io
import re
import unicodedata

from pypdf import PdfReader
from pdf2image import convert_from_bytes
import pytesseract
from PIL import Image


# ------------------------------------------
# Utils texte
# ------------------------------------------

def _strip_accents(s: str) -> str:
    """
    enlève les accents (Arrêté -> Arrete) pour matcher même si l'OCR casse les accents.
    """
    return "".join(
        c for c in unicodedata.normalize("NFD", s)
        if unicodedata.category(c) != "Mn"
    )


# ==================================================
# 1. Extraction du texte (PDF natif + OCR fallback)
# ==================================================

def _preprocess_for_ocr(img: Image.Image) -> Image.Image:
    """
    Amélioration OCR :
    - on convertit en niveaux de gris
    - on applique un seuillage binaire léger
    - on renvoie une image bien contrastée pour Tesseract
    """
    gray = img.convert("L")  # niveaux de gris
    # seuillage : <160 -> noir, sinon blanc
    bw = gray.point(lambda x: 0 if x < 160 else 255, "1")
    return bw


def extract_text_from_pdf_bytes(data: bytes) -> str:
    """
    Extraction du texte "normal" via pypdf (PDF natif, pas scanné).
    """
    try:
        reader = PdfReader(io.BytesIO(data))
        chunks = []
        for page in reader.pages:
            try:
                chunks.append(page.extract_text() or "")
            except Exception:
                chunks.append("")
        txt = "\n".join(chunks).strip()
        return txt
    except Exception:
        return ""


def extract_text_with_ocr_if_needed(data: bytes, min_len: int = 200) -> str:
    """
    1. Essaye d'abord l'extraction texte directe (pypdf).
    2. Si le texte trouvé est trop court (< min_len), on fait l'OCR :
       - convert_from_bytes(... dpi=300) -> images PIL par page
       - pré-traitement noir/blanc
       - pytesseract avec langue fra + psm 6 (lecture en bloc)
    """
    text = extract_text_from_pdf_bytes(data)
    if len(text) >= min_len:
        return text

    ocr_parts: List[str] = []
    try:
        # dpi 300 pour améliorer la netteté du scan
        images: List[Image.Image] = convert_from_bytes(data, dpi=300)
        for img in images:
            try:
                prep = _preprocess_for_ocr(img)
                try:
                    ocr_txt = pytesseract.image_to_string(
                        prep, lang="fra", config="--psm 6"
                    )
                except Exception:
                    # fallback sans langue forcée
                    ocr_txt = pytesseract.image_to_string(
                        prep, config="--psm 6"
                    )
            except Exception:
                # si preprocessing plante, on tente brut
                try:
                    ocr_txt = pytesseract.image_to_string(
                        img, lang="fra", config="--psm 6"
                    )
                except Exception:
                    ocr_txt = pytesseract.image_to_string(
                        img, config="--psm 6"
                    )

            ocr_parts.append(ocr_txt)

        ocr_full = "\n".join(ocr_parts).strip()

        # si l'OCR est meilleur (= plus long / plus riche) on le prend
        if len(ocr_full) > len(text):
            text = ocr_full
    except Exception:
        # si OCR plante, on renvoie au moins le texte de pypdf
        pass

    return text


# ========================
# 2. Détection de la date 
# ========================

def _normalize_numeric_date(d: str, mo: str, y: str) -> Optional[str]:
    """
    Normalise 22/10/25 ou 22-10-2025 -> '2025-10-22'
    """
    d = d.strip()
    mo = mo.strip()
    y = y.strip()

    # année à 2 chiffres -> "20xx"
    if len(y) == 2:
        y = "20" + y

    if len(y) != 4:
        return None

    d = d.zfill(2)
    mo = mo.zfill(2)
    return f"{y}-{mo}-{d}"


def _normalize_textual_date(d: str, month_txt: str, y: str) -> Optional[str]:
    """
    Normalise "22 octobre 2025" -> '2025-10-22'
    """
    mois_map = {
        "janvier": "01", "fevrier": "02", "février": "02",
        "mars": "03", "avril": "04", "mai": "05", "juin": "06",
        "juillet": "07", "aout": "08", "août": "08",
        "septembre": "09", "octobre": "10",
        "novembre": "11", "decembre": "12", "décembre": "12",
    }

    d = d.strip().zfill(2)
    y = y.strip()

    if len(y) != 4:
        return None

    key = (
        month_txt.lower()
        .strip()
        .strip(".")
    )
    key = _strip_accents(key)
    mo = mois_map.get(key)
    if not mo:
        return None

    return f"{y}-{mo}-{d}"


def _extract_date_from_line(line: str) -> Optional[str]:
    """
    Essaie d'extraire une date de cette ligne uniquement.
    Retourne 'YYYY-MM-DD' si possible, sinon None.
    """

    # Formats style 22/10/2025 ou 22-10-25
    m = re.search(r'\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b', line)
    if m:
        d, mo, y = m.groups()
        norm = _normalize_numeric_date(d, mo, y)
        if norm:
            return norm

    # Formats style "22 octobre 2025" (tolère accents ou pas)
    m2 = re.search(
        r'\b(\d{1,2})\s+([A-Za-zéûôîàùç\.]+)\s+(\d{4})\b',
        line,
        flags=re.IGNORECASE
    )
    if m2:
        d, month_txt, y = m2.groups()
        norm = _normalize_textual_date(d, month_txt, y)
        if norm:
            return norm

    return None


def guess_date_from_text(text: str) -> Optional[str]:
    """
    Objectif : récupérer la vraie date de signature/décision.
    On évite de prendre une date aléatoire dans le corps du texte.

    Stratégie de score :
    - on découpe en lignes
    - pour chaque ligne qui contient AU MOINS une date, on calcule un score
      basé sur :
        * est-ce qu'il y a des mots-clés genre 'Fait à', 'Pour le Maire', ...
        * est-ce qu'il y a des mots qui indiquent publication (on pénalise 'Publié le')
        * est-ce que la ligne est en bas du doc (bonus)
    - on garde la date de la ligne au score le plus élevé.

    Si aucune ligne candidate -> fallback "première date trouvée quelque part".
    """

    raw_lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    n = len(raw_lines)
    candidates: List[Tuple[float, int, str]] = []  # (score, idx, date)

    priority_keywords = [
        "fait à", "fait le", "fait a",
        "pour le maire", "pour la maire",
        "le maire", "madame la maire", "monsieur le maire",
        "le directeur", "la directrice", "directeur", "directrice",
        "par délégation", "par delegation",
        "signé le", "signee le", "signée le", "signature",
        "décision du", "decision du",
        "arrêté du", "arrete du", "arrêté n", "arrete n", "arrêté n°", "arrete n°",
        "délibération du", "deliberation du",
        "fait a l", "fait a l'", "fait a la",
    ]

    publish_keywords = [
        "publié le", "publie le", "publiée le", "publiee le",
        "publié le :", "diffusé le", "date de publication",
    ]

    for idx, line in enumerate(raw_lines):
        line_low = _strip_accents(line.lower())

        extracted = _extract_date_from_line(line)
        if not extracted:
            continue

        score = 0.0

        # bonus mots-clés signature / validation
        if any(k in line_low for k in priority_keywords):
            score += 5.0

        # pénalité si ça ressemble à "Publié le : 22/10/2025"
        if any(k in line_low for k in publish_keywords):
            score -= 2.5

        # bonus si la ligne est très bas dans le doc
        # ex: idx proche de n-1 -> bottom_weight proche de 1
        if n > 1:
            bottom_weight = idx / (n - 1)
        else:
            bottom_weight = 1.0
        score += bottom_weight * 2.0  # max +2

        # petit bonus si la ligne mentionne "fait à" ou "fait a"
        if "fait a" in line_low or "fait à" in line_low:
            score += 1.5

        candidates.append((score, idx, extracted))

    # Si on a des candidats scorés, on prend le meilleur score.
    if candidates:
        # tri par score DESC puis idx DESC (on préfère les lignes les plus basses en cas d'égalité de score)
        candidates.sort(key=lambda t: (t[0], t[1]), reverse=True)
        return candidates[0][2]

    # Fallback global : première date rencontrée dans tout le texte
    global_first = _extract_date_from_line("\n".join(raw_lines))
    if global_first:
        return global_first

    for ln in raw_lines:
        any_date = _extract_date_from_line(ln)
        if any_date:
            return any_date

    return None


# ==================================================
# 3. Détection du service
# ==================================================

def guess_service_smart(text: str, known_services: List[str]) -> Optional[str]:
    """
    Stratégie :
    - Chercher d'abord dans le haut (30 premières lignes)
      ET le bas (30 dernières lignes), car le service émetteur
      est souvent en-tête ou dans le bloc signature.
    - On fait une comparaison sans accents pour être tolerant à l'OCR.
    - Si rien trouvé : fallback recherche globale.
    """
    services_clean = [s for s in known_services if s]
    if not services_clean:
        return None

    lines = text.splitlines()
    head_zone = "\n".join(lines[:30]).lower()
    tail_zone = "\n".join(lines[-30:]).lower()

    head_zone_na = _strip_accents(head_zone)
    tail_zone_na = _strip_accents(tail_zone)

    # cherche en tête et pied
    for zone_na in (head_zone_na, tail_zone_na):
        for s in services_clean:
            s_na = _strip_accents(s.lower())
            if s_na and s_na in zone_na:
                return s

    # fallback global
    low_full_na = _strip_accents(text.lower())
    for s in services_clean:
        s_na = _strip_accents(s.lower())
        if s_na and s_na in low_full_na:
            return s

    return None


# ==================================================
# 4. Détection du type d'acte
# ==================================================

def _pick_known_type(variants: List[str], known_types: List[str]) -> Optional[str]:
    """
    Essaie d'associer nos variantes génériques ("arrete", "decision", "deliberation")
    avec un type officiel exact présent dans known_types.
    """
    for variant in variants:
        v = _strip_accents(variant.lower())
        for t in known_types:
            t_na = _strip_accents(t.lower())
            if v in t_na:
                return t
    return None


def guess_type_smart(text: str, known_types: List[str]) -> Optional[str]:
    """
    Règles métier renforcées :
    - On regarde l'en-tête (début du doc) pour des mots comme
      "DELIBERATION", "ARRÊTÉ N°", "DECISION DU MAIRE", etc.
    - On tolère les OCR de mauvaise qualité (accents partis).
    - On donne plus d'importance aux premières 15 lignes, car
      les actes officiels ont souvent le titre ultra clair tout en haut.
    """
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    top15 = "\n".join(lines[:15])
    full  = "\n".join(lines)

    def _score_block(block: str) -> Optional[str]:
        block_low_na = _strip_accents(block.lower())

        # 1. Décision
        # Exemples ciblés :
        #  - "DECISION DU MAIRE"
        #  - "DECISION"
        if re.search(r"\bdecision\s+du\s+maire\b", block_low_na, flags=re.IGNORECASE) \
           or re.search(r"\bdecision\b", block_low_na, flags=re.IGNORECASE):
            m = _pick_known_type(["décision", "decision"], known_types)
            if m:
                return m

        # 2. Arrêté
        # On vise :
        #  - "ARRETE N°2025/.."
        #  - "ARRETE DU ..."
        #  - "PAR ARRETE"
        if re.search(r"\barre?t[ée]?\s*(n|n°|num|du|de )", block_low_na, flags=re.IGNORECASE) \
           or re.search(r"\bpar\s+arre?t[ée]?\b", block_low_na, flags=re.IGNORECASE):
            m = _pick_known_type(["arrêté", "arrete", "arreté", "arrete municipal"], known_types)
            if m:
                return m

        # 3. Délibération
        # Exemples :
        #  - "DELIBERATION N° ..."
        #  - "DELIBERATION DU CONSEIL MUNICIPAL"
        #  - "DELIBERATION"
        if re.search(r"\bdelib[ée]ration\s*(n|n°|num|du|de )", block_low_na, flags=re.IGNORECASE) \
           or re.search(r"\bdelib[ée]ration\b", block_low_na, flags=re.IGNORECASE):
            m = _pick_known_type(["délibération", "deliberation"], known_types)
            if m:
                return m

        return None

    # d'abord, on essaie de deviner depuis le haut du document
    guess_top = _score_block(top15)
    if guess_top:
        return guess_top

    # si pas trouvé dans les 15 premières lignes, on essaie globalement
    guess_full = _score_block(full)
    if guess_full:
        return guess_full

    # fallback ultra-basique : si un type officiel apparaît littéralement quelque part
    full_low_na = _strip_accents(full.lower())
    for t in known_types:
        t_na = _strip_accents(t.lower())
        if t_na and t_na in full_low_na:
            return t

    return None


# ==================================================
# 5. Colle finale pour l'API / admin
# ==================================================

def guess_metadata_from_text(
    text: str,
    known_services: List[str],
    known_types: List[str],
) -> Tuple[Optional[str], Optional[str], Optional[str]]:
    """
    Retourne (date_auto, service_auto, type_auto)

    - date_auto: choisie par scoring (ligne en bas + mots-clés signature
      > "Publié le")
    - service_auto: cherche en-tête + signature d'abord
    - type_auto: détecté surtout dans les 15 premières lignes avec règles métier
    """
    date_auto = guess_date_from_text(text)
    service_auto = guess_service_smart(text, known_services)
    type_auto = guess_type_smart(text, known_types)

    return date_auto, service_auto, type_auto
