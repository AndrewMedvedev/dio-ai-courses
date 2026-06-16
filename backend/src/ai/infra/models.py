from __future__ import annotations

from uuid import UUID

from sqlalchemy import TEXT, Enum, ForeignKey, Index, Integer, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ...core.infrastructure import Base
from ..domain.vo import CourseStatus, CourseUserRole, DifficultyLevel


class CourseOrm(Base):
    __tablename__ = "courses"

    title: Mapped[str]
    description: Mapped[str] = mapped_column(TEXT)
    difficulty: Mapped[DifficultyLevel] = mapped_column(Enum(DifficultyLevel))
    tags: Mapped[list[str]] = mapped_column(JSONB, default=list)
    status: Mapped[CourseStatus] = mapped_column(Enum(CourseStatus))
    popularity: Mapped[int] = mapped_column(Integer, default=0)
    creator_id: Mapped[UUID]
    image_url: Mapped[str | None] = mapped_column(nullable=True)
    learning_objectives: Mapped[list[str]] = mapped_column(JSONB, default=list)
    final_assessment: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    modules: Mapped[list[ModuleOrm]] = relationship(
        back_populates="course",
        order_by="ModuleOrm.order",
    )
    users: Mapped[list[CourseUserOrm]] = relationship(back_populates="course")


class ModuleOrm(Base):
    __tablename__ = "modules"

    course_id: Mapped[UUID | None] = mapped_column(ForeignKey("courses.id"), nullable=True)
    title: Mapped[str]
    description: Mapped[str] = mapped_column(TEXT)
    order: Mapped[int | None] = mapped_column(nullable=True)
    learning_objectives: Mapped[list[str]] = mapped_column(JSONB, default=list)
    assignment: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    course: Mapped[CourseOrm | None] = relationship(back_populates="modules")
    lessons: Mapped[list[LessonOrm]] = relationship(
        back_populates="module",
        order_by="LessonOrm.order",
    )

    __table_args__ = (Index("ix_modules_course_id", "course_id"),)


class LessonOrm(Base):
    __tablename__ = "lessons"

    module_id: Mapped[UUID | None] = mapped_column(ForeignKey("modules.id"), nullable=True)
    title: Mapped[str]
    description: Mapped[str] = mapped_column(TEXT)
    order: Mapped[int | None] = mapped_column(nullable=True)
    learning_objectives: Mapped[list[str]] = mapped_column(JSONB, default=list)
    estimated_time_minutes: Mapped[int | None] = mapped_column(nullable=True)
    content_blocks: Mapped[list[dict]] = mapped_column(JSONB, default=list)
    assignment: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    module: Mapped[ModuleOrm | None] = relationship(back_populates="lessons")

    __table_args__ = (Index("ix_lessons_module_id", "module_id"),)


class CourseUserOrm(Base):
    __tablename__ = "course_users"

    course_id: Mapped[UUID] = mapped_column(ForeignKey("courses.id"))
    user_id: Mapped[UUID]
    role: Mapped[CourseUserRole] = mapped_column(Enum(CourseUserRole))

    course: Mapped[CourseOrm] = relationship(back_populates="users")

    __table_args__ = (
        UniqueConstraint("course_id", "user_id", name="uq_course_user"),
        Index("ix_course_users_user_id", "user_id"),
    )
