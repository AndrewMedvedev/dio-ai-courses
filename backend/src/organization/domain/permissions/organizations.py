from src.iam.domain.entities import Permission
from src.iam.domain.permissions.registry import register_permission
from src.iam.domain.vo import PermissionScope

CREATE = register_permission(
    Permission(
        resource="organization",
        action="create",
        scopes=frozenset({PermissionScope.GLOBAL}),
        title="Создание организации",
    ),
)

READ = register_permission(
    Permission(
        resource="organization",
        action="read",
        scopes=frozenset({PermissionScope.GLOBAL, PermissionScope.OWN}),
        title="Просмотр списка организаций",
    ),
)


UPDATE = register_permission(
    Permission(
        resource="organization",
        action="update",
        scopes=frozenset({
            PermissionScope.ORGANIZATION,
            PermissionScope.OWN,
            PermissionScope.GLOBAL,
        }),
        title="Изменение организации",
    ),
)

DELETE = register_permission(
    Permission(
        resource="organization",
        action="delete",
        scopes=frozenset({
            PermissionScope.GLOBAL,
        }),
        title="Удаление организации",
    ),
)
