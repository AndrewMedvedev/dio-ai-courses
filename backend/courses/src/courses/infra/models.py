from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from sqlalchemy import DateTime, Float, ForeignKey, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.courses.domain.vo import AttemptStatus, CourseStatus, EnrollmentStatus, GenerationStatus
from src.infra.db.base import Base


class Course(Base):
    """ORM-модель курса."""

    __tablename__ = "courses"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str] = mapped_column(Text)
    difficulty: Mapped[str] = mapped_column(String(50))
    tags: Mapped[list[str]] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String(20), default=CourseStatus.DRAFT.value)
    popularity: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    blocks: Mapped[list[Block]] = relationship(
        back_populates="course", cascade="all, delete-orphan", order_by="Block.position"
    )


class Block(Base):
    """ORM-модель блока курса."""

    __tablename__ = "blocks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    course_id: Mapped[str] = mapped_column(ForeignKey("courses.id"), index=True)
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str] = mapped_column(Text, default="")
    position: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    course: Mapped[Course] = relationship(back_populates="blocks")
    lessons: Mapped[list[Lesson]] = relationship(
        back_populates="block", cascade="all, delete-orphan", order_by="Lesson.position"
    )
    practice: Mapped[Practice | None] = relationship(
        back_populates="block", uselist=False, cascade="all, delete-orphan"
    )


class Lesson(Base):
    """ORM-модель урока."""

    __tablename__ = "lessons"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    block_id: Mapped[str] = mapped_column(ForeignKey("blocks.id"), index=True)
    title: Mapped[str] = mapped_column(String(255))
    content: Mapped[str] = mapped_column(Text)
    position: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    block: Mapped[Block] = relationship(back_populates="lessons")


class Practice(Base):
    """ORM-модель практического задания."""

    __tablename__ = "practices"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    block_id: Mapped[str] = mapped_column(ForeignKey("blocks.id"), unique=True, index=True)
    task: Mapped[str] = mapped_column(Text)
    criteria: Mapped[list[str]] = mapped_column(JSON, default=list)
    check_type: Mapped[str] = mapped_column(String(20), default="manual")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    block: Mapped[Block] = relationship(back_populates="practice")


class Enrollment(Base):
    """ORM-модель прохождения курса пользователем."""

    __tablename__ = "enrollments"
    __table_args__ = (UniqueConstraint("user_id", "course_id", name="uq_enrollments_user_course"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id: Mapped[int] = mapped_column(Integer, index=True)
    course_id: Mapped[str] = mapped_column(ForeignKey("courses.id"), index=True)
    status: Mapped[str] = mapped_column(String(20), default=EnrollmentStatus.IN_PROGRESS.value)
    current_block_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    current_lesson_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    completion_percent: Mapped[float] = mapped_column(Float, default=0.0)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    completions: Mapped[list[LessonCompletion]] = relationship(
        back_populates="enrollment", cascade="all, delete-orphan"
    )
    attempts: Mapped[list[PracticeAttempt]] = relationship(
        back_populates="enrollment", cascade="all, delete-orphan"
    )


class LessonCompletion(Base):
    """ORM-модель отметки прохождения урока."""

    __tablename__ = "lesson_completions"
    __table_args__ = (UniqueConstraint("enrollment_id", "lesson_id", name="uq_enrollment_lesson"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    enrollment_id: Mapped[str] = mapped_column(ForeignKey("enrollments.id"), index=True)
    lesson_id: Mapped[str] = mapped_column(ForeignKey("lessons.id"), index=True)
    completed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    enrollment: Mapped[Enrollment] = relationship(back_populates="completions")


class PracticeAttempt(Base):
    """ORM-модель попытки выполнения практики."""

    __tablename__ = "practice_attempts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    enrollment_id: Mapped[str] = mapped_column(ForeignKey("enrollments.id"), index=True)
    practice_id: Mapped[str] = mapped_column(ForeignKey("practices.id"), index=True)
    attempt_no: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(20), default=AttemptStatus.IN_PROGRESS.value)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    score: Mapped[float | None] = mapped_column(Float, nullable=True)
    feedback: Mapped[str | None] = mapped_column(Text, nullable=True)

    enrollment: Mapped[Enrollment] = relationship(back_populates="attempts")
    submissions: Mapped[list[PracticeSubmission]] = relationship(
        back_populates="attempt", cascade="all, delete-orphan"
    )


class PracticeSubmission(Base):
    """ORM-модель ответа на практическое задание."""

    __tablename__ = "practice_submissions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    attempt_id: Mapped[str] = mapped_column(ForeignKey("practice_attempts.id"), index=True)
    answer_type: Mapped[str] = mapped_column(String(20))
    text_answer: Mapped[str | None] = mapped_column(Text, nullable=True)
    code_answer: Mapped[str | None] = mapped_column(Text, nullable=True)
    file_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    attempt: Mapped[PracticeAttempt] = relationship(back_populates="submissions")


class CourseGenerationTask(Base):
    """ORM-модель фоновой задачи генерации курса."""

    __tablename__ = "course_generation_tasks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    topic: Mapped[str] = mapped_column(String(255))
    target_audience: Mapped[str] = mapped_column(String(255))
    difficulty: Mapped[str] = mapped_column(String(50))
    llm_model: Mapped[str] = mapped_column(String(80), default="gpt-4.1-mini")
    blocks_count: Mapped[int] = mapped_column(Integer)
    lessons_per_block: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(20), default=GenerationStatus.PENDING.value)
    course_id: Mapped[str | None] = mapped_column(ForeignKey("courses.id"), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )

