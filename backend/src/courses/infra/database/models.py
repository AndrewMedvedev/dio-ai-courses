from __future__ import annotations

from typing import Any

from datetime import datetime
from uuid import UUID

from pydantic import JsonValue
from sqlalchemy import (
    TEXT,
    CheckConstraint,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.core.database import Base
from src.courses.domain.assessment.enums import (
    AssignmentCreationPolicy,
    AssignmentEvaluationPolicy,
    AssignmentSource,
    AssignmentStatus,
    AssignmentType,
    AttemptStatus,
    CourseCompletionPolicy,
    CourseVisibility,
    EvaluationResult,
    EvaluationStatus,
    ExaminerType,
    NavigationPolicy,
    PracticeStatus,
)
from src.courses.domain.catalog.enums import (
    CourseStatus,
    DifficultyLevel,
)
from src.courses.domain.catalog.vo import (
    AnyContentBlock,
)
from src.courses.domain.enrollment.vo import (
    MemberRole,
)
from src.courses.domain.knowledge.enums import (
    DocumentNodeType,
)

from .types import ContentBlockListType


class CourseOrm(Base):
    __tablename__ = "courses"

    title: Mapped[str]
    description: Mapped[str] = mapped_column(TEXT)
    difficulty: Mapped[DifficultyLevel] = mapped_column(Enum(DifficultyLevel))
    tags: Mapped[list[str]] = mapped_column(JSONB, default=list)
    status: Mapped[CourseStatus] = mapped_column(Enum(CourseStatus))
    popularity: Mapped[int] = mapped_column(Integer, default=0)
    creator_id: Mapped[UUID]
    organization_id: Mapped[UUID]
    image_url: Mapped[str | None] = mapped_column(nullable=True)
    learning_objectives: Mapped[list[str]] = mapped_column(JSONB, default=list)

    modules: Mapped[list[ModuleOrm]] = relationship(
        back_populates="course",
        order_by="ModuleOrm.rank",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    members: Mapped[list[MemberOrm]] = relationship(back_populates="course")

    course_progress: Mapped[list[CourseProgressOrm]] = relationship(back_populates="course")


class ModuleOrm(Base):
    __tablename__ = "modules"

    course_id: Mapped[UUID] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"))
    title: Mapped[str]
    description: Mapped[str] = mapped_column(TEXT)
    rank: Mapped[str] = mapped_column(
        String(128, collation="C"),
        nullable=False,
    )

    learning_objectives: Mapped[list[str]] = mapped_column(JSONB, default=list)

    course: Mapped[CourseOrm] = relationship(back_populates="modules")
    lessons: Mapped[list[LessonOrm]] = relationship(
        back_populates="module",
        order_by="LessonOrm.rank",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    __table_args__ = (
        UniqueConstraint(
            "course_id",
            "rank",
            name="uq_module_course_rank",
            deferrable=True,
            initially="DEFERRED",
        ),
    )


class LessonOrm(Base):
    __tablename__ = "lessons"

    module_id: Mapped[UUID] = mapped_column(
        ForeignKey("modules.id", ondelete="CASCADE"),
        nullable=False,
    )
    title: Mapped[str]
    description: Mapped[str] = mapped_column(TEXT)
    rank: Mapped[str] = mapped_column(
        String(128, collation="C"),
        nullable=False,
    )
    learning_objectives: Mapped[list[str]] = mapped_column(
        JSONB,
        default=list,
    )
    estimated_time_minutes: Mapped[int | None] = mapped_column(
        nullable=True,
    )
    content_blocks: Mapped[list[AnyContentBlock]] = mapped_column(
        ContentBlockListType,
        default=list,
    )

    module: Mapped[ModuleOrm] = relationship(
        back_populates="lessons",
    )

    __table_args__ = (
        UniqueConstraint(
            "module_id",
            "rank",
            name="uq_lesson_module_rank",
            deferrable=True,
            initially="DEFERRED",
        ),
    )


class LessonTheorySessionOrm(Base):
    __tablename__ = "lesson_theory_sessions"

    __table_args__ = (
        CheckConstraint(
            "active_time_seconds >= 0",
            name="ck_lesson_theory_session_active_time_non_negative",
        ),
        CheckConstraint(
            "max_scroll_depth_percent BETWEEN 0 AND 100",
            name="ck_lesson_theory_session_scroll_depth_range",
        ),
    )

    lesson_id: Mapped[UUID] = mapped_column(
        ForeignKey("lessons.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id: Mapped[UUID]
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    active_time_seconds: Mapped[int] = mapped_column(default=0)
    max_scroll_depth_percent: Mapped[int] = mapped_column(default=0)


class CourseProgressOrm(Base):
    __tablename__ = "course_progress"

    user_id: Mapped[UUID]
    progress_percent: Mapped[float] = mapped_column(Float, default=0)
    course_id: Mapped[UUID] = mapped_column(
        ForeignKey("courses.id", ondelete="CASCADE"),
        nullable=False,
    )
    module_progresses: Mapped[list[ModuleProgressOrm]] = relationship(
        back_populates="course_progress",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    course: Mapped[CourseOrm] = relationship(
        back_populates="course_progress",
    )

    __table_args__ = (
        UniqueConstraint("user_id", "course_id", name="uq_course_progress_user_course"),
    )


class ModuleProgressOrm(Base):
    __tablename__ = "module_progress"

    course_progress_id: Mapped[UUID] = mapped_column(
        ForeignKey("course_progress.id", ondelete="CASCADE"),
        nullable=False,
    )
    module_id: Mapped[UUID]
    course_progress: Mapped[CourseProgressOrm] = relationship(back_populates="module_progresses")
    lesson_progresses: Mapped[list[LessonProgressOrm]] = relationship(
        back_populates="module_progress",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    __table_args__ = (
        UniqueConstraint(
            "course_progress_id",
            "module_id",
            name="uq_module_progress_course_module",
        ),
        Index("ix_module_progress_course_progress_id", "course_progress_id"),
    )


class LessonProgressOrm(Base):
    __tablename__ = "lesson_progress"

    module_progress_id: Mapped[UUID] = mapped_column(
        ForeignKey("module_progress.id", ondelete="CASCADE"),
        nullable=False,
    )
    lesson_id: Mapped[UUID]
    theory_completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), default=None
    )
    practice_completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), default=None
    )
    test_completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), default=None
    )
    module_progress: Mapped[ModuleProgressOrm] = relationship(back_populates="lesson_progresses")
    __table_args__ = (
        UniqueConstraint(
            "module_progress_id",
            "lesson_id",
            name="uq_lesson_progress_module_lesson",
        ),
    )


class ChatOrm(Base):
    __tablename__ = "chats"

    user_id: Mapped[UUID]
    course_id: Mapped[UUID]
    messages: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list)


class MemberOrm(Base):
    __tablename__ = "members"

    course_id: Mapped[UUID] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"))
    role: Mapped[MemberRole] = mapped_column(TEXT)

    user_id: Mapped[UUID]

    course: Mapped[CourseOrm] = relationship(back_populates="members")

    __table_args__ = (
        UniqueConstraint("course_id", "user_id", name="uq_member"),
        Index("ix_members_user_id", "user_id"),
    )


class DocumentOrm(Base):
    __tablename__ = "documents"

    owner_id: Mapped[UUID] = mapped_column(nullable=False)

    # ── Дерево ────────────────────────────────────────────────────────────────
    parent_node_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    node_type: Mapped[DocumentNodeType] = mapped_column(index=True)

    # Заголовок (для TOC + HEADING)
    title: Mapped[str | None] = mapped_column(TEXT, index=True)

    # Текст (только для TEXT leaf-узлов)
    content: Mapped[str | None] = mapped_column(TEXT)

    # ── Relations ─────────────────────────────────────────────────────────────

    # FIX 1: Mapped[Optional[...]] — parent_node может быть None у TOC-корня.
    # FIX 2: foreign_keys явно указан, иначе SQLAlchemy выбрасывает
    #         AmbiguousForeignKeysError для self-referential таблиц.
    parent_node: Mapped[DocumentOrm | None] = relationship(
        "DocumentOrm",
        remote_side="DocumentOrm.id",
        back_populates="children",
        foreign_keys="[DocumentOrm.parent_node_id]",
    )

    # FIX 3: passive_deletes=True — доверяем CASCADE на уровне БД.
    #         Без него SQLAlchemy загружает всё дерево потомков в память
    #         и удаляет по одному (катастрофа для больших деревьев).
    # FIX 2 (продолжение): foreign_keys обязателен и здесь.
    children: Mapped[list[DocumentOrm]] = relationship(
        "DocumentOrm",
        back_populates="parent_node",
        cascade="all, delete-orphan",
        passive_deletes=True,
        foreign_keys="[DocumentOrm.parent_node_id]",
    )

    # ── Indexes & constraints ──────────────────────────────────────────────────
    __table_args__ = (
        Index("ix_doc_owner_parent", "owner_id", "parent_node_id"),
        Index("ix_doc_owner_type", "owner_id", "node_type"),
        # FIX 4: Защита только от прямой самоссылки — циклы A→B→A
        #         не покрываются; полная защита требует триггера или
        #         проверки на уровне приложения (см. pipeline ниже).
        CheckConstraint("id != parent_node_id", name="ck_no_self_parent"),
    )


class CourseSettingsOrm(Base):
    __tablename__ = "course_settings"

    id: Mapped[UUID] = mapped_column(
        "course_id", ForeignKey("courses.id", ondelete="CASCADE"), primary_key=True
    )
    visibility: Mapped[CourseVisibility] = mapped_column(Enum(CourseVisibility))
    navigation_policy: Mapped[NavigationPolicy] = mapped_column(Enum(NavigationPolicy))
    completion_policy: Mapped[CourseCompletionPolicy] = mapped_column(Enum(CourseCompletionPolicy))
    mentor_enabled: Mapped[bool]


class AssignmentSettingsOrm(Base):
    __tablename__ = "assignment_settings"

    id: Mapped[UUID] = mapped_column(
        "course_id", ForeignKey("courses.id", ondelete="CASCADE"), primary_key=True
    )
    creation_policy: Mapped[AssignmentCreationPolicy] = mapped_column(
        Enum(AssignmentCreationPolicy)
    )
    evaluation_policy: Mapped[AssignmentEvaluationPolicy] = mapped_column(
        Enum(AssignmentEvaluationPolicy)
    )
    auto_generate_missing: Mapped[bool]
    practice_enabled: Mapped[bool]
    tests_enabled: Mapped[bool]


class AssignmentOrm(Base):
    __tablename__ = "assignments"

    type: Mapped[AssignmentType] = mapped_column(Enum(AssignmentType))
    source: Mapped[AssignmentSource] = mapped_column(Enum(AssignmentSource))
    status: Mapped[AssignmentStatus] = mapped_column(Enum(AssignmentStatus))
    unit_type: Mapped[str]
    # Полиморфная ссылка на курс, модуль или урок: один FK на три таблицы невозможен.
    unit_id: Mapped[UUID]
    current_version_id: Mapped[UUID | None] = mapped_column(
        ForeignKey(
            "assignment_versions.id",
            name="fk_assignment_current_version",
            use_alter=True,
            ondelete="SET NULL",
        )
    )

    current_version: Mapped[AssignmentVersionOrm | None] = relationship(
        foreign_keys=[current_version_id], post_update=True
    )
    versions: Mapped[list[AssignmentVersionOrm]] = relationship(
        back_populates="assignment", foreign_keys="AssignmentVersionOrm.assignment_id"
    )
    attempts: Mapped[list[AssignmentAttemptOrm]] = relationship(back_populates="assignment")


class AssignmentVersionOrm(Base):
    __tablename__ = "assignment_versions"

    assignment_id: Mapped[UUID] = mapped_column(ForeignKey("assignments.id"))
    version: Mapped[int]
    title: Mapped[str]
    description: Mapped[str] = mapped_column(TEXT)
    content: Mapped[dict[str, JsonValue]] = mapped_column(JSONB)
    rules: Mapped[dict[str, JsonValue]] = mapped_column(JSONB)

    assignment: Mapped[AssignmentOrm] = relationship(
        back_populates="versions", foreign_keys=[assignment_id]
    )
    attempts: Mapped[list[AssignmentAttemptOrm]] = relationship(
        back_populates="assignment_version"
    )

    __table_args__ = (UniqueConstraint("assignment_id", "version", name="uq_assignment_version"),)


class AssignmentAttemptOrm(Base):
    __tablename__ = "assignment_attempts"

    assignment_id: Mapped[UUID] = mapped_column(ForeignKey("assignments.id"))
    assignment_version_id: Mapped[UUID] = mapped_column(ForeignKey("assignment_versions.id"))
    student_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"))
    attempt_number: Mapped[int]
    status: Mapped[AttemptStatus] = mapped_column(Enum(AttemptStatus))
    answers: Mapped[JsonValue] = mapped_column(JSONB, default=dict)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    assignment: Mapped[AssignmentOrm] = relationship(back_populates="attempts")
    assignment_version: Mapped[AssignmentVersionOrm] = relationship(back_populates="attempts")
    evaluations: Mapped[list[AssignmentEvaluationOrm]] = relationship(back_populates="attempt")


class AssignmentEvaluationOrm(Base):
    __tablename__ = "assignment_evaluations"

    attempt_id: Mapped[UUID] = mapped_column(ForeignKey("assignment_attempts.id"))
    examiner_type: Mapped[ExaminerType] = mapped_column(Enum(ExaminerType))
    examiner_id: Mapped[UUID | None]
    status: Mapped[EvaluationStatus] = mapped_column(
        Enum(EvaluationStatus), default=EvaluationStatus.PENDING
    )
    result: Mapped[EvaluationResult | None] = mapped_column(Enum(EvaluationResult))
    score: Mapped[float | None] = mapped_column(Float)
    feedback: Mapped[str | None] = mapped_column(TEXT)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    attempt: Mapped[AssignmentAttemptOrm] = relationship(back_populates="evaluations")


class PracticeOrm(Base):
    __tablename__ = "practices"

    user_id: Mapped[UUID]
    module_id: Mapped[UUID]
    lesson_id: Mapped[UUID]
    status: Mapped[PracticeStatus] = mapped_column(Enum(PracticeStatus))

    practice: Mapped[list[dict[str, Any]]] = mapped_column(JSONB)


class InvitationOrm(Base):
    __tablename__ = "course_invitations"

    title: Mapped[str]
    course_id: Mapped[UUID]
    user_id: Mapped[UUID | None] = mapped_column(nullable=True)
    email: Mapped[str]
    token: Mapped[str] = mapped_column(unique=True)
    invited_by: Mapped[UUID]
    role: Mapped[str]
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_used: Mapped[bool]

    __table_args__ = (
        Index("ix_course_invitation_email", "email"),
        Index("ix_course_invitation_expires_at", "expires_at"),
    )


class GenerationSessionOrm(Base):
    __tablename__ = "generation_sessions"

    creator_id: Mapped[UUID]
    status: Mapped[str]
    generation_key: Mapped[str] = mapped_column(
        unique=True,
        index=True,
    )
