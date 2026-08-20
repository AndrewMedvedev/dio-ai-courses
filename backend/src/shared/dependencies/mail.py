from src.core.settings import settings
from src.shared.infra.mail import SmtpMailClient

mail_client = SmtpMailClient(
    smtp_port=settings.mail.smtp_port,
    smtp_host=settings.mail.smtp_host,
    use_tls=settings.mail.smtp_use_tls,
)
