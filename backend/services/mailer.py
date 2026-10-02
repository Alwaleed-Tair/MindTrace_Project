"""Outgoing e-mail (password reset links). Standard library only: smtplib with STARTTLS (port 587) or SSL (465)."""
from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage

from core.config import Settings

log = logging.getLogger("mindtrace.mail")


def send(settings: Settings, to: str, subject: str, text: str) -> bool:
    """True when handed to the SMTP server. Without SMTP settings the message goes to the server log instead."""
    if not settings.email_configured:
        log.warning("e-mail not configured (MINDTRACE_SMTP_HOST); message for %s:\n%s\n%s", to, subject, text)
        return False
    msg = EmailMessage()
    msg["From"] = settings.smtp_from or settings.smtp_user
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(text)
    try:
        if settings.smtp_port == 465:
            with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=20) as s:
                if settings.smtp_user:
                    s.login(settings.smtp_user, settings.smtp_password)
                s.send_message(msg)
        else:
            with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20) as s:
                s.starttls()
                if settings.smtp_user:
                    s.login(settings.smtp_user, settings.smtp_password)
                s.send_message(msg)
        return True
    except (OSError, smtplib.SMTPException) as exc:
        log.error("could not send e-mail to %s: %s", to, exc)
        return False
