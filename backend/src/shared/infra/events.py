from __future__ import annotations

import asyncio
import logging
from collections import defaultdict
from collections.abc import Awaitable, Callable

from ..domain.events import Event

logger = logging.getLogger(__name__)

EventHandler = Callable[[Event], Awaitable[None] | None]


class EventBus:
    """Внутрипроцессная асинхронная шина доменных событий."""

    def __init__(self, max_queue_size: int = 1000) -> None:
        """Инициализировать очередь событий и таблицу обработчиков."""

        self._queue: asyncio.Queue[Event] = asyncio.Queue(maxsize=max_queue_size)
        self._handlers: dict[type[Event], list[EventHandler]] = defaultdict(list)
        self._task: asyncio.Task[None] | None = None
        self._is_running = False

    def subscribe(self, event_type: type[Event], handler: EventHandler) -> None:
        """Подписать обработчик на тип доменного события."""

        self._handlers[event_type].append(handler)

    async def publish(self, event: Event) -> None:
        """Опубликовать событие в очередь обработки."""

        try:
            self._queue.put_nowait(event)
        except asyncio.QueueFull:
            logger.exception("EventBus queue is full. Dropping event: %s", type(event).__name__)

    async def publish_all(self, events: list[Event]) -> None:
        """Опубликовать список доменных событий."""

        for event in events:
            await self.publish(event)

    async def start(self) -> None:
        """Запустить фоновую обработку событий."""

        if self._is_running:
            return

        self._is_running = True
        self._task = asyncio.create_task(self._process_events())
        logger.info("EventBus started")

    async def stop(self) -> None:
        """Остановить фоновую обработку событий."""

        self._is_running = False
        if self._task is None:
            return

        self._task.cancel()
        try:
            await self._task
        except asyncio.CancelledError:
            pass
        finally:
            self._task = None
        logger.info("EventBus stopped")

    async def _process_events(self) -> None:
        """Обрабатывать события из очереди до остановки шины."""

        while self._is_running:
            try:
                event = await self._queue.get()
                await self._dispatch(event)
                self._queue.task_done()
            except asyncio.CancelledError:
                break
            except Exception:
                logger.exception("Unexpected error in EventBus processing loop")

    async def _dispatch(self, event: Event) -> None:
        """Передать событие всем зарегистрированным обработчикам."""

        handlers = self._handlers.get(type(event), [])
        if not handlers:
            logger.debug("No handlers registered for event: %s", type(event).__name__)
            return

        for handler in handlers:
            try:
                result = handler(event)
                if asyncio.iscoroutine(result):
                    await result
            except Exception:
                logger.exception(
                    "Error in handler %s for event %s",
                    getattr(handler, "__name__", str(handler)),
                    type(event).__name__,
                )
