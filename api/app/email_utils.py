# api/app/email_utils.py
import smtplib
from email.message import EmailMessage
from pathlib import Path
from typing import Optional

from .config import settings


def send_acte_email(
    to_email: str,
    acte_title: str,
    link_url: str,
    pdf_path: Optional[str] = None,
) -> None:
    """
    Envoie un e-mail via SMTP avec :
      - un lien vers la page publique de l'acte
      - éventuellement le PDF en pièce jointe (si pdf_path n'est pas None)

    Lève RuntimeError en cas de problème (mauvaise config SMTP, erreur réseau, etc.).
    """

    # Vérification basique de la config SMTP
    if not settings.SMTP_HOST or not settings.SMTP_PORT:
        raise RuntimeError("Service e-mail non configuré (SMTP_HOST/SMTP_PORT manquants).")

    # Adresse d'expéditeur
    from_addr = settings.SMTP_FROM or settings.SMTP_USER or "noreply@example.com"

    msg = EmailMessage()
    msg["From"] = from_addr
    msg["To"] = to_email
    msg["Subject"] = f"[Recueil des actes] {acte_title}"

    body = f"""Bonjour,

Vous avez demandé l'envoi de l'acte :

  « {acte_title} »

Vous pouvez le consulter en ligne ici :
{link_url}

Ceci est un message automatique, merci de ne pas répondre.
"""
    msg.set_content(body)

    # Pièce jointe PDF si demandée
    if pdf_path is not None:
        try:
            p = Path(pdf_path)
            pdf_bytes = p.read_bytes()
        except FileNotFoundError:
            raise RuntimeError("Fichier PDF introuvable pour l'acte.")
        except Exception as e:
            raise RuntimeError(f"Erreur lors de la lecture du PDF : {e}")

        filename = p.name or "acte.pdf"
        msg.add_attachment(
            pdf_bytes,
            maintype="application",
            subtype="pdf",
            filename=filename,
        )

    try:
        if settings.SMTP_USE_TLS:
            # STARTTLS (ex: Gmail, port 587)
            with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
                server.starttls()
                if settings.SMTP_USER and settings.SMTP_PASSWORD:
                    server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                server.send_message(msg)
        else:
            # Connexion SSL directe (ex: port 465)
            with smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT) as server:
                if settings.SMTP_USER and settings.SMTP_PASSWORD:
                    server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                server.send_message(msg)
    except Exception as e:
        # On encapsule tout dans RuntimeError pour que le router
        # puisse renvoyer une HTTPException
        raise RuntimeError(f"Erreur lors de l'envoi SMTP : {e}")
