from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from src.api.dependencies import get_db
from src.app.schemas.courses import (
    AttemptOut,
    CompleteLessonRequest,
    EnrollRequest,
    ProgressOut,
    ReviewAttemptRequest,
    StartAttemptRequest,
    SubmitAttemptRequest,
    attempt_out_from_orm,
)
from src.app.services.course_service import (
    active_lessons,
    active_practice,
    advance_after_practice,
    is_block_practice_passed,
    is_lesson_completed,
    must_get_block,
    must_get_course,
    must_get_lesson,
    progress_payload,
    recalculate_progress,
)
from src.infra.db.models import (
    AttemptStatus,
    Block,
    CourseStatus,
    Enrollment,
    EnrollmentStatus,
    Lesson,
    LessonCompletion,
    Practice,
    PracticeAttempt,
    PracticeSubmission,
)

router = APIRouter(prefix="/courses", tags=["Progress"])


@router.post("/{course_id}/enrollments", response_model=ProgressOut, status_code=201)
def enroll(course_id: str, payload: EnrollRequest, db: Session = Depends(get_db)) -> ProgressOut:
    from src.app.services.course_service import find_first_lesson

    course = must_get_course(db, course_id)
    if course.status != CourseStatus.PUBLISHED.value:
        raise HTTPException(status_code=400, detail="Only published courses are available for enrollment")

    existing = db.scalar(
        select(Enrollment).where(Enrollment.course_id == course_id, Enrollment.user_id == payload.user_id)
    )
    if existing is not None:
        return progress_payload(existing)

    first_block_id, first_lesson_id = find_first_lesson(course)
    enrollment = Enrollment(
        user_id=payload.user_id,
        course_id=course_id,
        status=EnrollmentStatus.IN_PROGRESS.value,
        current_block_id=first_block_id,
        current_lesson_id=first_lesson_id,
        completion_percent=0,
    )
    db.add(enrollment)
    db.commit()
    db.refresh(enrollment)
    return progress_payload(enrollment)


@router.get("/{course_id}/progress/{user_id}", response_model=ProgressOut)
def get_progress(course_id: str, user_id: int, db: Session = Depends(get_db)) -> ProgressOut:
    must_get_course(db, course_id)
    enrollment = db.scalar(
        select(Enrollment).where(Enrollment.course_id == course_id, Enrollment.user_id == user_id)
    )
    if enrollment is None:
        raise HTTPException(status_code=404, detail="Enrollment not found")
    return progress_payload(enrollment)


@router.post("/{course_id}/lessons/{lesson_id}/complete", response_model=ProgressOut)
def complete_lesson(
    course_id: str,
    lesson_id: str,
    payload: CompleteLessonRequest,
    db: Session = Depends(get_db),
) -> ProgressOut:
    course = must_get_course(db, course_id)
    lesson = must_get_lesson(db, lesson_id, course_id)
    block = db.scalar(select(Block).where(Block.id == lesson.block_id))
    if block is None:
        raise HTTPException(status_code=404, detail="Block not found")

    enrollment = db.scalar(
        select(Enrollment).where(Enrollment.course_id == course_id, Enrollment.user_id == payload.user_id)
    )
    if enrollment is None:
        raise HTTPException(status_code=404, detail="Enrollment not found")

    if enrollment.status == EnrollmentStatus.COMPLETED.value:
        return progress_payload(enrollment)

    if enrollment.current_lesson_id and enrollment.current_lesson_id != lesson_id and not is_lesson_completed(db, enrollment.id, lesson_id):
        raise HTTPException(status_code=400, detail="Lesson is locked by navigation rules")

    if not is_lesson_completed(db, enrollment.id, lesson_id):
        db.add(LessonCompletion(enrollment_id=enrollment.id, lesson_id=lesson_id))
        db.flush()

    block_lessons = db.scalars(
        select(Lesson).where(Lesson.block_id == block.id, Lesson.deleted_at.is_(None)).order_by(Lesson.position)
    ).all()
    lesson_ids = [item.id for item in block_lessons]
    current_index = lesson_ids.index(lesson_id)

    next_lesson_id = lesson_ids[current_index + 1] if current_index + 1 < len(lesson_ids) else None
    if next_lesson_id is not None:
        enrollment.current_block_id = block.id
        enrollment.current_lesson_id = next_lesson_id
    else:
        practice = active_practice(block)
        if practice is not None and not is_block_practice_passed(db, enrollment.id, practice.id):
            enrollment.current_block_id = block.id
            enrollment.current_lesson_id = None
        else:
            advance_after_practice(db, enrollment, course, block.id)

    recalculate_progress(db, enrollment, course)
    db.commit()
    db.refresh(enrollment)
    return progress_payload(enrollment)


@router.post("/{course_id}/blocks/{block_id}/practice/attempts", response_model=AttemptOut)
def start_practice_attempt(
    course_id: str,
    block_id: str,
    payload: StartAttemptRequest,
    db: Session = Depends(get_db),
) -> AttemptOut:
    must_get_course(db, course_id)
    block = must_get_block(db, course_id, block_id)
    practice = active_practice(block)
    if practice is None:
        raise HTTPException(status_code=404, detail="Practice not found")

    enrollment = db.scalar(
        select(Enrollment).where(Enrollment.course_id == course_id, Enrollment.user_id == payload.user_id)
    )
    if enrollment is None:
        raise HTTPException(status_code=404, detail="Enrollment not found")

    for item in active_lessons(block):
        if not is_lesson_completed(db, enrollment.id, item.id):
            raise HTTPException(status_code=400, detail="Practice is locked until all lessons in block are completed")

    in_progress = db.scalar(
        select(PracticeAttempt).where(
            PracticeAttempt.enrollment_id == enrollment.id,
            PracticeAttempt.practice_id == practice.id,
            PracticeAttempt.status == AttemptStatus.IN_PROGRESS.value,
        )
    )
    if in_progress is not None:
        return attempt_out_from_orm(in_progress)

    attempts_count = db.scalar(
        select(func.count(PracticeAttempt.id)).where(
            PracticeAttempt.enrollment_id == enrollment.id,
            PracticeAttempt.practice_id == practice.id,
        )
    ) or 0

    attempt = PracticeAttempt(
        enrollment_id=enrollment.id,
        practice_id=practice.id,
        attempt_no=attempts_count + 1,
        status=AttemptStatus.IN_PROGRESS.value,
    )
    db.add(attempt)
    db.commit()
    db.refresh(attempt)
    return attempt_out_from_orm(attempt)


@router.post("/practice-attempts/{attempt_id}/submit", response_model=AttemptOut)
def submit_practice_attempt(
    attempt_id: str,
    payload: SubmitAttemptRequest,
    db: Session = Depends(get_db),
) -> AttemptOut:
    attempt = db.scalar(select(PracticeAttempt).where(PracticeAttempt.id == attempt_id))
    if attempt is None:
        raise HTTPException(status_code=404, detail="Attempt not found")
    if attempt.status != AttemptStatus.IN_PROGRESS.value:
        raise HTTPException(status_code=400, detail="Only in_progress attempt can receive submission")

    db.add(
        PracticeSubmission(
            attempt_id=attempt.id,
            answer_type=payload.answer_type,
            text_answer=payload.text_answer,
            code_answer=payload.code_answer,
            file_url=payload.file_url,
        )
    )
    db.commit()
    db.refresh(attempt)
    return attempt_out_from_orm(attempt)


@router.post("/practice-attempts/{attempt_id}/review", response_model=ProgressOut)
def review_practice_attempt(
    attempt_id: str,
    payload: ReviewAttemptRequest,
    db: Session = Depends(get_db),
) -> ProgressOut:
    attempt = db.scalar(select(PracticeAttempt).where(PracticeAttempt.id == attempt_id))
    if attempt is None:
        raise HTTPException(status_code=404, detail="Attempt not found")
    if attempt.status != AttemptStatus.IN_PROGRESS.value:
        raise HTTPException(status_code=400, detail="Attempt already reviewed")

    attempt.status = AttemptStatus.PASSED.value if payload.passed else AttemptStatus.FAILED.value
    attempt.score = payload.score
    attempt.feedback = payload.feedback
    attempt.checked_at = datetime.utcnow()

    enrollment = db.scalar(select(Enrollment).where(Enrollment.id == attempt.enrollment_id))
    if enrollment is None:
        raise HTTPException(status_code=404, detail="Enrollment not found")

    course = must_get_course(db, enrollment.course_id)
    if payload.passed:
        practice = db.scalar(select(Practice).where(Practice.id == attempt.practice_id))
        if practice is not None:
            block = db.scalar(select(Block).where(Block.id == practice.block_id))
            if block is not None:
                advance_after_practice(db, enrollment, course, block.id)

    db.flush()
    recalculate_progress(db, enrollment, course)
    db.commit()
    db.refresh(enrollment)
    return progress_payload(enrollment)
