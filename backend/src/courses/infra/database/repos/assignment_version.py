from src.courses.domain.assessment.entities import AssignmentVersion
from src.shared.infra.database.repos.sqlalchemy import SqlAlchemyRepository

from ..mappers import AssignmentVersionMapper
from ..models import AssignmentVersionOrm


class SqlAssignmentVersionRepository(
    SqlAlchemyRepository[AssignmentVersion, AssignmentVersionOrm]
):
    model = AssignmentVersionOrm
    model_mapper = AssignmentVersionMapper()
