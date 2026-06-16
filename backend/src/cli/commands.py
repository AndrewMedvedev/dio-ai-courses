import logging

from ..core.infrastructure import session_factory
from ..core.settings import settings
from ..iam.database.repository import SqlUserRepository
from ..iam.domain.services import create_super_admin
from ..iam.security import hash_password

logger = logging.getLogger(__name__)


async def create_first_admin() -> None:
    """Создание системного администратора"""

    async with session_factory() as session:
        user_repo = SqlUserRepository(session)
        exists = await user_repo.get_by_email(settings.admin.email)
        if exists:
            logger.warning("Admin already exists")
            return
        admin = create_super_admin(
            email=settings.admin.email, password_hash=hash_password(settings.admin.password)
        )
        await user_repo.create(admin)
        await session.commit()
        logger.info("First admin created successfully")
