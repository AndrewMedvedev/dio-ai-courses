from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import String, and_, func, or_, select
from sqlalchemy.orm import Session

from src.api.dependencies import get_db
from src.app.schemas.courses import (
    BlockCreate,
    BlockUpdate,
    CourseCreate,
    CourseListItem,
    CourseListOut,
    CourseOut,
    CourseUpdate,
    LessonCreate,
    LessonUpdate,
    PracticePayload,
    ReorderPayload,
)
from src.app.services.course_service import (
    active_blocks,
    active_lessons,
    active_practice,
    create_block_nested,
    ensure_can_publish,
    must_get_block,
    must_get_course,
    must_get_lesson,
    serialize_course,
)
from src.infra.db.models import Block, Course, CourseStatus, Lesson, Practice

router = APIRouter(prefix="/courses", tags=["Courses"])


@router.post("", response_model=CourseOut, status_code=status.HTTP_201_CREATED)
def create_course(payload: CourseCreate, db: Session = Depends(get_db)) -> CourseOut:
    course = Course(
        title=payload.title,
        description=payload.description,
        difficulty=payload.difficulty,
        tags=payload.tags,
        status=CourseStatus.DRAFT.value,
    )
    db.add(course)
    db.flush()

    for block_data in payload.blocks:
        create_block_nested(db, course.id, block_data)

    db.commit()
    db.refresh(course)
    return serialize_course(must_get_course(db, course.id))


@router.get("", response_model=CourseListOut)
def list_courses(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    status_filter: str | None = Query(None, alias="status"),
    difficulty: str | None = None,
    tags: str | None = None,
    search: str | None = None,
    sort: str = "-created_at",
    db: Session = Depends(get_db),
) -> CourseListOut:
    query = select(Course).where(Course.deleted_at.is_(None))

    filters = []
    if status_filter:
        filters.append(Course.status == status_filter)
    if difficulty:
        filters.append(Course.difficulty == difficulty)
    if search:
        filters.append(
            or_(Course.title.ilike(f"%{search}%"), Course.description.ilike(f"%{search}%"))
        )
    if tags:
        for tag in [x.strip() for x in tags.split(",") if x.strip()]:
            filters.append(Course.tags.cast(String).ilike(f"%\"{tag}\"%"))

    if filters:
        query = query.where(and_(*filters))

    if sort == "created_at":
        query = query.order_by(Course.created_at.asc())
    elif sort == "name":
        query = query.order_by(Course.title.asc())
    elif sort == "-name":
        query = query.order_by(Course.title.desc())
    elif sort == "popularity":
        query = query.order_by(Course.popularity.asc())
    elif sort == "-popularity":
        query = query.order_by(Course.popularity.desc())
    else:
        query = query.order_by(Course.created_at.desc())

    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    offset = (page - 1) * limit
    courses = db.scalars(query.offset(offset).limit(limit)).all()

    items = [
        CourseListItem(
            id=course.id,
            title=course.title,
            description=course.description,
            difficulty=course.difficulty,
            tags=course.tags or [],
            status=course.status,
            popularity=course.popularity,
            created_at=course.created_at,
        )
        for course in courses
    ]
    next_page = page + 1 if (offset + len(items)) < total else None

    return CourseListOut(items=items, total=total, page=page, limit=limit, next_page=next_page)


@router.get("/{course_id}", response_model=CourseOut)
def get_course(course_id: str, db: Session = Depends(get_db)) -> CourseOut:
    return serialize_course(must_get_course(db, course_id))


@router.patch("/{course_id}", response_model=CourseOut)
def update_course(course_id: str, payload: CourseUpdate, db: Session = Depends(get_db)) -> CourseOut:
    course = must_get_course(db, course_id)

    if payload.title is not None:
        course.title = payload.title
    if payload.description is not None:
        course.description = payload.description
    if payload.difficulty is not None:
        course.difficulty = payload.difficulty
    if payload.tags is not None:
        course.tags = payload.tags
    if payload.status is not None:
        if payload.status not in {
            CourseStatus.DRAFT.value,
            CourseStatus.PUBLISHED.value,
            CourseStatus.ARCHIVED.value,
        }:
            raise HTTPException(status_code=400, detail="Invalid course status")
        if payload.status == CourseStatus.PUBLISHED.value:
            ensure_can_publish(course)
        course.status = payload.status

    db.commit()
    db.refresh(course)
    return serialize_course(must_get_course(db, course_id))


@router.delete(
    "/{course_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
)
def delete_course(course_id: str, db: Session = Depends(get_db)) -> Response:
    course = must_get_course(db, course_id)
    if course.status == CourseStatus.PUBLISHED.value:
        raise HTTPException(
            status_code=409,
            detail="Cannot delete published course. Switch status to archived first.",
        )

    deleted_at = datetime.utcnow()
    course.deleted_at = deleted_at
    for block in active_blocks(course):
        block.deleted_at = deleted_at
        for lesson in active_lessons(block):
            lesson.deleted_at = deleted_at
        practice = active_practice(block)
        if practice is not None:
            practice.deleted_at = deleted_at

    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{course_id}/blocks", response_model=CourseOut, status_code=status.HTTP_201_CREATED)
def create_block(course_id: str, payload: BlockCreate, db: Session = Depends(get_db)) -> CourseOut:
    must_get_course(db, course_id)
    max_position = db.scalar(
        select(func.max(Block.position)).where(Block.course_id == course_id, Block.deleted_at.is_(None))
    )
    block = Block(
        course_id=course_id,
        title=payload.title,
        description=payload.description,
        position=(max_position + 1) if max_position is not None else 1,
    )
    db.add(block)
    db.commit()
    return serialize_course(must_get_course(db, course_id))


@router.patch("/{course_id}/blocks/{block_id}", response_model=CourseOut)
def update_block(course_id: str, block_id: str, payload: BlockUpdate, db: Session = Depends(get_db)) -> CourseOut:
    block = must_get_block(db, course_id, block_id)
    if payload.title is not None:
        block.title = payload.title
    if payload.description is not None:
        block.description = payload.description
    db.commit()
    return serialize_course(must_get_course(db, course_id))


@router.delete("/{course_id}/blocks/{block_id}", response_model=CourseOut)
def delete_block(course_id: str, block_id: str, db: Session = Depends(get_db)) -> CourseOut:
    block = must_get_block(db, course_id, block_id)
    deleted_at = datetime.utcnow()
    block.deleted_at = deleted_at
    for lesson in active_lessons(block):
        lesson.deleted_at = deleted_at
    practice = active_practice(block)
    if practice is not None:
        practice.deleted_at = deleted_at
    db.commit()
    return serialize_course(must_get_course(db, course_id))


@router.put("/{course_id}/blocks/reorder", response_model=CourseOut)
def reorder_blocks(course_id: str, payload: ReorderPayload, db: Session = Depends(get_db)) -> CourseOut:
    blocks = db.scalars(
        select(Block).where(Block.course_id == course_id, Block.deleted_at.is_(None)).order_by(Block.position)
    ).all()
    existing_ids = {block.id for block in blocks}
    if set(payload.ids) != existing_ids:
        raise HTTPException(status_code=400, detail="ids must match all active blocks")

    for index, block_id in enumerate(payload.ids, start=1):
        block = next(b for b in blocks if b.id == block_id)
        block.position = index

    db.commit()
    return serialize_course(must_get_course(db, course_id))


@router.post("/{course_id}/blocks/{block_id}/lessons", response_model=CourseOut, status_code=status.HTTP_201_CREATED)
def create_lesson(course_id: str, block_id: str, payload: LessonCreate, db: Session = Depends(get_db)) -> CourseOut:
    block = must_get_block(db, course_id, block_id)
    max_position = db.scalar(
        select(func.max(Lesson.position)).where(Lesson.block_id == block.id, Lesson.deleted_at.is_(None))
    )
    db.add(
        Lesson(
            block_id=block.id,
            title=payload.title,
            content=payload.content,
            position=(max_position + 1) if max_position is not None else 1,
        )
    )
    db.commit()
    return serialize_course(must_get_course(db, course_id))


@router.patch("/{course_id}/lessons/{lesson_id}", response_model=CourseOut)
def update_lesson(course_id: str, lesson_id: str, payload: LessonUpdate, db: Session = Depends(get_db)) -> CourseOut:
    lesson = must_get_lesson(db, lesson_id, course_id)
    if payload.title is not None:
        lesson.title = payload.title
    if payload.content is not None:
        lesson.content = payload.content
    db.commit()
    return serialize_course(must_get_course(db, course_id))


@router.delete("/{course_id}/lessons/{lesson_id}", response_model=CourseOut)
def delete_lesson(course_id: str, lesson_id: str, db: Session = Depends(get_db)) -> CourseOut:
    lesson = must_get_lesson(db, lesson_id, course_id)
    lesson.deleted_at = datetime.utcnow()
    db.commit()
    return serialize_course(must_get_course(db, course_id))


@router.put("/{course_id}/blocks/{block_id}/lessons/reorder", response_model=CourseOut)
def reorder_lessons(course_id: str, block_id: str, payload: ReorderPayload, db: Session = Depends(get_db)) -> CourseOut:
    must_get_block(db, course_id, block_id)
    lessons = db.scalars(
        select(Lesson).where(Lesson.block_id == block_id, Lesson.deleted_at.is_(None)).order_by(Lesson.position)
    ).all()
    existing_ids = {lesson.id for lesson in lessons}
    if set(payload.ids) != existing_ids:
        raise HTTPException(status_code=400, detail="ids must match all active lessons")

    for index, lesson_id in enumerate(payload.ids, start=1):
        lesson = next(l for l in lessons if l.id == lesson_id)
        lesson.position = index

    db.commit()
    return serialize_course(must_get_course(db, course_id))


@router.post("/{course_id}/blocks/{block_id}/practice", response_model=CourseOut, status_code=status.HTTP_201_CREATED)
def create_practice(course_id: str, block_id: str, payload: PracticePayload, db: Session = Depends(get_db)) -> CourseOut:
    block = must_get_block(db, course_id, block_id)
    if active_practice(block) is not None:
        raise HTTPException(status_code=409, detail="Practice already exists for this block")

    db.add(
        Practice(
            block_id=block.id,
            task=payload.task,
            criteria=payload.criteria,
            check_type=payload.check_type,
        )
    )
    db.commit()
    return serialize_course(must_get_course(db, course_id))


@router.put("/{course_id}/blocks/{block_id}/practice", response_model=CourseOut)
def update_practice(course_id: str, block_id: str, payload: PracticePayload, db: Session = Depends(get_db)) -> CourseOut:
    block = must_get_block(db, course_id, block_id)
    practice = active_practice(block)
    if practice is None:
        raise HTTPException(status_code=404, detail="Practice not found")

    practice.task = payload.task
    practice.criteria = payload.criteria
    practice.check_type = payload.check_type
    db.commit()
    return serialize_course(must_get_course(db, course_id))


@router.delete("/{course_id}/blocks/{block_id}/practice", response_model=CourseOut)
def delete_practice(course_id: str, block_id: str, db: Session = Depends(get_db)) -> CourseOut:
    block = must_get_block(db, course_id, block_id)
    practice = active_practice(block)
    if practice is None:
        raise HTTPException(status_code=404, detail="Practice not found")
    practice.deleted_at = datetime.utcnow()
    db.commit()
    return serialize_course(must_get_course(db, course_id))
