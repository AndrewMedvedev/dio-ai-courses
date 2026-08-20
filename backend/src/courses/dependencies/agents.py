from typing import Annotated

from fastapi import Depends

from src.shared.dependencies.database import DBSession

from ..agents.external_agents import editor, interviewer, mentor, practice
from .base import ChatRepoDep, LessonRepoDep, PracticeRepoDep


def get_interviewer_agent(session: DBSession, repo: ChatRepoDep) -> interviewer.InterviewerAgent:
    """Получает document service, чтобы вызывающий код работал через единый интерфейс."""
    return interviewer.InterviewerAgent(repo=repo, session=session)


def get_editor_agent(session: DBSession, repo: ChatRepoDep) -> editor.EditorAgent:
    """Получает document service, чтобы вызывающий код работал через единый интерфейс."""
    return editor.EditorAgent(repo=repo, session=session)


def get_mentor_agent(session: DBSession, repo: ChatRepoDep) -> mentor.MentorAgent:
    """Получает document service, чтобы вызывающий код работал через единый интерфейс."""
    return mentor.MentorAgent(repo=repo, session=session)


def get_practice_agent(
    session: DBSession,
    practice_repo: PracticeRepoDep,
    lesson_repo: LessonRepoDep,
) -> practice.PracticeAgents:
    """Получает document service, чтобы вызывающий код работал через единый интерфейс."""
    return practice.PracticeAgents(
        practice_repo=practice_repo, session=session, lesson_repo=lesson_repo
    )


InterviewerAgentDep = Annotated[interviewer.InterviewerAgent, Depends(get_interviewer_agent)]

EditorAgentDep = Annotated[editor.EditorAgent, Depends(get_editor_agent)]

MentorAgentDep = Annotated[mentor.MentorAgent, Depends(get_mentor_agent)]

PracticeAgentsDep = Annotated[practice.PracticeAgents, Depends(get_practice_agent)]
