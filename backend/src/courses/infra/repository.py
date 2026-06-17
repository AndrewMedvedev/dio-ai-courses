from typing import Any

import logging
import time
from uuid import UUID, uuid4

from fastembed.sparse import SparseTextEmbedding
from qdrant_client import AsyncQdrantClient, models
from sqlalchemy import select, update

from ...core.retrieval_components import embed, rerank
from ...shared.infra.repos import ModelMapper, SqlAlchemyRepository
from ..domain.dependencies import splitter
from ..domain.entities import Course, Lesson, LessonBasicInfo, Module
from .models import CourseOrm, LessonOrm, ModuleOrm

logger = logging.getLogger(__name__)


class LessonMapper(ModelMapper[Lesson, LessonOrm]):
    @staticmethod
    def to_entity(model: LessonOrm) -> Lesson:
        return Lesson(
            id=model.id,
            created_at=model.created_at,
            updated_at=model.updated_at,
            title=model.title,
            description=model.description,
            order=model.order,  # type: ignore  # noqa: PGH003
            learning_objectives=model.learning_objectives,
            content_blocks=model.content_blocks,  # type: ignore  # noqa: PGH003
            estimated_time_minutes=model.estimated_time_minutes,
            assignment=model.assignment,  # type: ignore  # noqa: PGH003
        )

    @staticmethod
    def from_entity(entity: Lesson) -> LessonOrm:
        return LessonOrm(
            id=entity.id,
            created_at=entity.created_at,
            updated_at=entity.updated_at,
            title=entity.title,
            description=entity.description,
            order=entity.order,
            learning_objectives=entity.learning_objectives,
            content_blocks=entity.content_blocks,
            estimated_time_minutes=entity.estimated_time_minutes,
            assignment=entity.assignment,
            # module_id не передаём — проставляется через assign_module
        )

    @staticmethod
    def basic_info_mapper(row: tuple) -> LessonBasicInfo:
        return LessonBasicInfo(
            id=row.id,  # type: ignore  # noqa: PGH003
            title=row.title,  # type: ignore  # noqa: PGH003
            description=row.description,  # type: ignore  # noqa: PGH003
            order=row.order,  # type: ignore  # noqa: PGH003
            learning_objectives=row.learning_objectives,  # type: ignore  # noqa: PGH003
            estimated_time_minutes=row.estimated_time_minutes,  # type: ignore  # noqa: PGH003
        )


class ModuleMapper(ModelMapper[Module, ModuleOrm]):
    @staticmethod
    def to_entity(model: ModuleOrm) -> Module:
        return Module(
            id=model.id,
            created_at=model.created_at,
            updated_at=model.updated_at,
            title=model.title,
            description=model.description,
            order=model.order,  # type: ignore  # noqa: PGH003
            learning_objectives=model.learning_objectives,
            assignment=model.assignment,  # type: ignore  # noqa: PGH003
            # маппим каждый LessonOrm в доменный Lesson
            lessons=[LessonMapper.to_entity(lesson) for lesson in model.lessons],
        )

    @staticmethod
    def from_entity(entity: Module) -> ModuleOrm:
        return ModuleOrm(
            id=entity.id,
            created_at=entity.created_at,
            updated_at=entity.updated_at,
            title=entity.title,
            description=entity.description,
            order=entity.order,
            learning_objectives=entity.learning_objectives,
            assignment=entity.assignment,
        )


class CourseMapper(ModelMapper[Course, CourseOrm]):
    @staticmethod
    def to_entity(model: CourseOrm) -> Course:
        return Course(
            id=model.id,
            created_at=model.created_at,
            updated_at=model.updated_at,
            title=model.title,
            description=model.description,
            difficulty=model.difficulty,
            tags=model.tags,
            status=model.status,
            popularity=model.popularity,
            creator_id=model.creator_id,
            image_url=model.image_url,
            learning_objectives=model.learning_objectives,
            final_assessment=model.final_assessment,  # type: ignore  # noqa: PGH003
            # маппим каждый ModuleOrm в доменный Module
            modules=[ModuleMapper.to_entity(module) for module in model.modules],
        )

    @staticmethod
    def from_entity(entity: Course) -> CourseOrm:
        return CourseOrm(
            id=entity.id,
            created_at=entity.created_at,
            updated_at=entity.updated_at,
            title=entity.title,
            description=entity.description,
            difficulty=entity.difficulty,
            tags=entity.tags,
            status=entity.status,
            popularity=entity.popularity,
            creator_id=entity.creator_id,
            image_url=entity.image_url,
            learning_objectives=entity.learning_objectives,
            final_assessment=entity.final_assessment,
            # modules не передаём — модули уже в БД,
            # course_id им проставит assign_course
        )


class SqlLessonRepository(SqlAlchemyRepository[Lesson, LessonOrm]):
    model = LessonOrm
    model_mapper = LessonMapper  # type: ignore  # noqa: PGH003

    async def get_by_id_basic_info(self, lesson_id: UUID) -> LessonBasicInfo | None:
        stmt = select(
            self.model.id,
            self.model.title,
            self.model.description,
            self.model.order,
            self.model.learning_objectives,
            self.model.estimated_time_minutes,
        ).where(self.model.id == lesson_id)
        result = await self.session.execute(stmt)
        model = result.one_or_none()
        return None if model is None else self.model_mapper.basic_info_mapper(model)  # type: ignore  # noqa: PGH003

    async def assign_module(
        self,
        lesson_ids: list[UUID],
        module_id: UUID,
    ) -> None:
        stmt = update(self.model).where(self.model.id.in_(lesson_ids)).values(module_id=module_id)

        await self.session.execute(stmt)


class SqlModuleRepository(SqlAlchemyRepository[Module, ModuleOrm]):
    model = ModuleOrm
    model_mapper = ModuleMapper  # type: ignore  # noqa: PGH003

    async def assign_course(
        self,
        module_ids: list[UUID],
        course_id: UUID,
    ) -> None:
        stmt = update(self.model).where(self.model.id.in_(module_ids)).values(course_id=course_id)

        await self.session.execute(stmt)


class SqlCourseRepository(SqlAlchemyRepository[Course, CourseOrm]):
    model = CourseOrm
    model_mapper = CourseMapper  # type: ignore  # noqa: PGH003


class VectorRepository:
    """
    Async RAG repository:

    Dense (embeddings) + BM25 + Qdrant + Reranker.
    """

    def __init__(
        self,
        client: AsyncQdrantClient,
        collection_name: str = "MAIN_COLLECTION",
    ):
        self.client = client
        self.collection_name = collection_name
        self.sparse_model = SparseTextEmbedding(model_name="Qdrant/bm25")

    async def index_document(self, text: str, metadata: dict[str, Any] | None = None) -> None:
        """Асинхронная индексация"""

        if not text.strip():
            logger.warning("Attempted to index empty text!")
            return

        start_time = time.monotonic()
        logger.info("Starting index document text, length %s characters", len(text))
        chunks = splitter.split_text(text)
        points = []
        for chunk in chunks:
            dense_vector = await embed(inputs=[text])
            sparse = next(self.sparse_model.embed([chunk]))  # type: ignore  # noqa: PGH003
            indices = [i.indices.tolist() for i in sparse]
            values = [i.values.tolist() for i in sparse]
            points.append(
                models.PointStruct(
                    id=str(uuid4()),
                    vector={
                        "dense": dense_vector[0],
                        "bm25": models.SparseVector(
                            indices=indices[0],
                            values=values[0],
                        ),
                    },
                    payload=metadata or {},
                )
            )

        await self.client.upsert(
            collection_name=self.collection_name,
            points=points,
            wait=True,
        )
        logger.info(
            "Finished indexing text, time %s seconds", round(time.monotonic() - start_time, 2)
        )

    async def retrieve_documents(
        self,
        query: str,
        limit: int = 5,
        prefetch_limit: int = 25,
        metadata_filters: dict[str, Any] | None = None,
    ) -> list[str]:
        """Hybrid search: Dense + BM25 + RRF + Rerank."""
        dense_query = await embed(inputs=[query])
        sparse_query = next(self.sparse_model.embed([query]))  # type: ignore  # noqa: PGH003

        qdrant_filter = None
        if metadata_filters:
            conditions: list[models.FieldCondition] = []

            for key, value in metadata_filters.items():
                if isinstance(value, list):
                    conditions.append(
                        models.FieldCondition(
                            key=key,
                            match=models.MatchAny(any=value),
                        )
                    )
                else:
                    conditions.append(
                        models.FieldCondition(
                            key=key,
                            match=models.MatchValue(value=value),
                        )
                    )

            qdrant_filter = models.Filter(must=conditions)  # type: ignore  # noqa: PGH003

        response = await self.client.query_points(
            collection_name=self.collection_name,
            prefetch=[
                models.Prefetch(
                    query=dense_query,
                    using="dense",
                    limit=prefetch_limit,
                    filter=qdrant_filter,
                ),
                models.Prefetch(
                    query=models.SparseVector(
                        indices=sparse_query.indices.tolist(),
                        values=sparse_query.values.tolist(),
                    ),
                    using="bm25",
                    limit=prefetch_limit,
                    filter=qdrant_filter,
                ),
            ],
            query=models.FusionQuery(
                fusion=models.Fusion.RRF,
            ),
            limit=prefetch_limit,
            with_payload=True,
        )

        candidates = []
        texts = []

        for p in response.points:
            payload = p.payload or {}
            text = payload.get("text", "")
            candidates.append({
                "id": p.id,
                "text": text,
                "payload": payload,
            })
            texts.append(text)

        if not texts:
            return []

        # rerank возвращает list[dict] с index, relevance_score, document
        # уже отсортирован по relevance_score desc, берём топ limit
        rerank_results = await rerank(query=query, documents=texts, top_n=limit)

        return [
            (
                f"**Relevance score:** {round(r['relevance_score'], 2)}\n"
                f"**Source:** {candidates[r['index']]['payload'].get('source', '')}\n"
                f"**Category:** {candidates[r['index']]['payload'].get('category', '')}\n"
                "**Document:**\n"
                f"{r['document']}"
            )
            for r in rerank_results
        ]
