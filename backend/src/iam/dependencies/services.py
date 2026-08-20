from typing import Annotated

from fastapi import Depends

from src.iam.application.services import AuthService, RegistrationService
from src.shared.dependencies import TransactionDep

from .base import (
    CacheDep,
    InvitationRepositoryDep,
    MembershipRepositoryDep,
    OrganizationRepositoryDep,
    RoleRepositoryDep,
    UserRepositoryDep,
)


def get_auth_service(
    user_repo: UserRepositoryDep,
    membership_repo: MembershipRepositoryDep,
    role_repo: RoleRepositoryDep,
    organization_repo: OrganizationRepositoryDep,
    cache: CacheDep,
) -> AuthService:
    return AuthService(
        user_repo=user_repo,
        membership_repo=membership_repo,
        role_repo=role_repo,
        organization_repo=organization_repo,
        cache=cache,
    )


def get_registration_service(
    transaction: TransactionDep,
    user_repo: UserRepositoryDep,
    membership_repo: MembershipRepositoryDep,
    role_repo: RoleRepositoryDep,
    invitation_repo: InvitationRepositoryDep,
) -> RegistrationService:
    return RegistrationService(
        transaction=transaction,
        user_repo=user_repo,
        membership_repo=membership_repo,
        role_repo=role_repo,
        invitation_repo=invitation_repo,
    )


AuthServiceDep = Annotated[AuthService, Depends(get_auth_service)]
RegistrationServiceDep = Annotated[RegistrationService, Depends(get_registration_service)]
