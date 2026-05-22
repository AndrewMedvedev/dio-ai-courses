from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import DateTime, Float, ForeignKey, Integer, JSON, String, Text, UniqueConstraint, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from courses.domain.vo import CourseStatus, EnrollmentStatus, GenerationStatus
from infra.db.base import Base


class Course(Base):
    """ORM-модель курса."""

    __tablename__ = "courses"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    creator_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str] = mapped_column(Text)
    learning_objectives: Mapped[list[str]] = mapped_column(JSON, default=list)
    difficulty: Mapped[str] = mapped_column(String(50))
    tags: Mapped[list[str]] = mapped_column(JSON, default=list)
    final_assessment: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default=CourseStatus.DRAFT.value)
    popularity: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    modules: Mapped[list[Module]] = relationship(
        back_populates="course", cascade="all, delete-orphan", order_by="Module.order"
    )

class Module(Base):
    """ORM-модель модуля курса."""

    __tablename__ = "modules"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    course_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("courses.id"), index=True)
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str] = mapped_column(Text, default="")
    learning_objectives: Mapped[list[str]] = mapped_column(JSON, default=list)
    content_blocks: Mapped[list[dict]] = mapped_column(JSON, default=list)
    order: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    course: Mapped[Course] = relationship(back_populates="modules")
    lessons: Mapped[list[Lesson]] = relationship(
        back_populates="module", cascade="all, delete-orphan", order_by="Lesson.position"
    )
    practice: Mapped[Practice | None] = relationship(
        back_populates="module", uselist=False, cascade="all, delete-orphan"
    )

class Lesson(Base):
    """ORM-модель урока."""

    __tablename__ = "lessons"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    module_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("modules.id"), index=True)
    title: Mapped[str] = mapped_column(String(255))
    content: Mapped[str] = mapped_column(Text)
    learning_objectives: Mapped[list[str]] = mapped_column(JSON, default=list)
    content_blocks: Mapped[list[dict]] = mapped_column(JSON, default=list)
    estimated_time_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    position: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    module: Mapped[Module] = relationship(back_populates="lessons")


class Practice(Base):
    """ORM-модель практического задания."""

    __tablename__ = "practices"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    module_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("modules.id"), unique=True, index=True)
    title: Mapped[str] = mapped_column(String(255), default="")
    task: Mapped[str] = mapped_column(Text)
    criteria: Mapped[list[str]] = mapped_column(JSON, default=list)
    check_type: Mapped[str] = mapped_column(String(20), default="manual")
    assignment_type: Mapped[str] = mapped_column(String(50), default="manual")
    assignment_data: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    passing_score: Mapped[int] = mapped_column(Integer, default=61)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    module: Mapped[Module] = relationship(back_populates="practice")


class Enrollment(Base):
    """ORM-модель прохождения курса пользователем."""

    __tablename__ = "enrollments"
    __table_args__ = (UniqueConstraint("user_id", "course_id", name="uq_enrollments_user_course"),)

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    user_id: Mapped[int] = mapped_column(Integer, index=True)
    course_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("courses.id"), index=True)
    status: Mapped[str] = mapped_column(String(20), default=EnrollmentStatus.IN_PROGRESS.value)
    current_module_id: Mapped[UUID | None] = mapped_column(Uuid, nullable=True)
    current_lesson_id: Mapped[UUID | None] = mapped_column(Uuid, nullable=True)
    completion_percent: Mapped[float] = mapped_column(Float, default=0.0)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    completions: Mapped[list[LessonCompletion]] = relationship(
        back_populates="enrollment", cascade="all, delete-orphan"
    )

class LessonCompletion(Base):
    """ORM-модель отметки прохождения урока."""

    __tablename__ = "lesson_completions"
    __table_args__ = (UniqueConstraint("enrollment_id", "lesson_id", name="uq_enrollment_lesson"),)

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    enrollment_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("enrollments.id"), index=True)
    lesson_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("lessons.id"), index=True)
    completed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    enrollment: Mapped[Enrollment] = relationship(back_populates="completions")


class CourseGenerationTask(Base):
    """ORM-модель фоновой задачи генерации курса."""

    __tablename__ = "course_generation_tasks"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    topic: Mapped[str] = mapped_column(String(255))
    target_audience: Mapped[str] = mapped_column(String(255))
    difficulty: Mapped[str] = mapped_column(String(50))
    llm_model: Mapped[str] = mapped_column(String(80), default="gpt-4.1-mini")
    modules_count: Mapped[int] = mapped_column(Integer)
    lessons_per_module: Mapped[int] = mapped_column(Integer)
    plan_data: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default=GenerationStatus.PENDING.value)
    course_id: Mapped[UUID | None] = mapped_column(Uuid, ForeignKey("courses.id"), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
