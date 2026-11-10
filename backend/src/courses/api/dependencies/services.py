# pyright: reportArgumentType=false
from typing import Annotated

from uuid import UUID

from fastapi import Depends

from src.courses.api.dependencies.repos import (
    CourseRepoDep,
    InvitationRepoDep,
    MemberRepoDep,
)
from src.courses.application.enrollment.repos import IAMRepository, OrganizationRepository
from src.courses.application.enrollment.services.invitations import InvitationService
from src.courses.application.learning.repos import ProgressRepository
from src.courses.infra.external_apis import IAMClient, invite_user_in_organization
from src.courses.infra.services import course_client
from src.iam.dependencies import CurrentIdentity
from src.shared.dependencies.database import TransactionDep
from src.shared.domain.exceptions import NotFoundError


def get_iam_repo() -> IAMRepository:
    return IAMClient(course_client)


IAMRepoDep = Annotated[IAMRepository, Depends(get_iam_repo)]


def get_organization_repo() -> OrganizationRepository:
    return invite_user_in_organization


OrganizationRepoDep = Annotated[OrganizationRepository, Depends(get_organization_repo)]


def get_invitation_service(
    invitation_repo: InvitationRepoDep,
    course_repo: CourseRepoDep,
    member_repo: MemberRepoDep,
    transaction: TransactionDep,
    iam_repo: IAMRepoDep,
    organization_repo: OrganizationRepoDep,
) -> InvitationService:
    return InvitationService(
        invitation_repo=invitation_repo,
        transaction=transaction,
        course_repo=course_repo,
        member_repo=member_repo,
        iam_repo=iam_repo,
        organization_repo=organization_repo,
        client=course_client,
    )


async def get_progress(
    user_id: UUID,
    resource_id: UUID,
    repo: ProgressRepository,
):
    progress = await repo.get_by_user(user_id, resource_id)
    if progress is None:
        raise NotFoundError("Progress was not found")
    return progress


async def get_identity_id(identity: CurrentIdentity) -> str:
    return str(identity.id)


InvitationServiceDep = Annotated[InvitationService, Depends(get_invitation_service)]
