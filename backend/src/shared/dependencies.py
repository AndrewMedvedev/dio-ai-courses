from typing import Annotated

from fastapi import Depends, Query
from pydantic import PositiveInt
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.database import get_db
from ..core.settings import settings
from .infra.mail import SmtpMailSender
from .schemas import PageParams

SessionDep = Annotated[AsyncSession, Depends(get_db)]


def get_page_params(
    page: Annotated[
        PositiveInt,
        Query(
            ge=1,
            description="Номер страницы (начинается с 1)",
            examples=[1],
        ),
    ] = 1,
    size: Annotated[
        PositiveInt,
        Query(
            ge=1,
            le=100,
            description="Количество элементов на странице (от 1 до 100)",
            examples=[20],
        ),
    ] = 10,
) -> PageParams:
    return PageParams(page=page, size=size)


PageParamsDep = Annotated[PageParams, Depends(get_page_params)]


def get_mail_sender() -> SmtpMailSender:
    return SmtpMailSender(
        smtp_port=settings.mail.smtp_port,
        smtp_host=settings.mail.smtp_host,
        use_tls=settings.mail.smtp_use_tls,
    )
