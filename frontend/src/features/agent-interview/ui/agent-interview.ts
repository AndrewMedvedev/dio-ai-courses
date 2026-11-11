import {
  createAgentConversationKey,
  useAgentStore,
  type AgentType,
} from '@/entities/agent-chat';

import {
  generationJobKey,
  useGenerationJobsStore,
  type GenerationJob,
  type GenerationJobKind,
} from '@/entities/generation-job';

interface InterviewTexts {
  agent: AgentType;
  eyebrow: string;
  title: string;
  intro: string;
  placeholder: string;
  started: string;
  confirmTitle: string;
  running: (job: GenerationJob) => string;
  done: (job: GenerationJob) => string;
  open: string;
  another: string;
  anotherHint: string;
}

export const TEXTS: Record<GenerationJobKind, InterviewTexts> = {
  module: {
    agent: 'module_interviewer',
    eyebrow: 'ИИ-генерация модуля',
    title: 'Новый модуль с ИИ',
    intro:
      'Расскажите, какой модуль нужен: тема, для кого он и что студент должен уметь после него. Агент задаст пару уточняющих вопросов, покажет структуру и стоимость и попросит подтвердить запуск.',
    placeholder:
      'Например: модуль про расчёт отпускных для бухгалтеров-новичков',
    started: 'Генерация модуля запущена.',
    confirmTitle: 'Запустить генерацию модуля?',
    running: (job) =>
      job.resultId
        ? `Модуль «${job.resultTitle || 'без названия'}» создаётся. Готово уроков: ${job.lessonsCount}.`
        : 'Модуль генерируется. Это может занять несколько минут — окно можно закрыть.',
    done: (job) =>
      `Модуль «${job.resultTitle || 'без названия'}» готов: ${job.lessonsCount} урок(ов).`,
    open: 'Открыть модуль',
    another: 'Сгенерировать ещё модуль',
    anotherHint:
      'Новый модуль встанет сразу после этого. Другое место можно выбрать в списке модулей — кнопка «Сгенерировать модуль здесь».',
  },
  lesson: {
    agent: 'lesson_interviewer',
    eyebrow: 'ИИ-генерация урока',
    title: 'Новый урок с ИИ',
    intro:
      'Опишите урок: какую тему он раскрывает, что студент уже знает и чему должен научиться. Агент уточнит детали, покажет структуру и попросит подтвердить запуск.',
    placeholder: 'Например: урок о том, как считать НДФЛ с премии',
    started: 'Генерация урока запущена.',
    confirmTitle: 'Запустить генерацию урока?',
    running: () =>
      'Урок генерируется. Это может занять несколько минут — окно можно закрыть.',
    done: (job) => `Урок «${job.resultTitle || 'без названия'}» готов.`,
    open: 'Открыть урок',
    another: 'Сгенерировать ещё урок',
    anotherHint:
      'Новый урок встанет сразу после этого. Другое место можно выбрать в списке уроков — кнопка «Сгенерировать урок здесь».',
  },
};

export const conversationKeyFor = (
  kind: GenerationJobKind,
  courseId: string,
  moduleId = '',
) =>
  createAgentConversationKey(
    (TEXTS[kind] || TEXTS.module).agent,
    courseId,
    kind === 'lesson' ? moduleId : 'new-module',
  );

export const jobKeyFor = (
  kind: GenerationJobKind,
  courseId: string,
  moduleId = '',
) => generationJobKey(kind, courseId, kind === 'lesson' ? moduleId : '');

/**
 * Начинает генерацию заново: удаляет переписку (следующий запрос уйдёт с новым chat_id)
 * и завершённую или упавшую генерацию. Окно чата при этом остаётся открытым.
 */
export function resetAgentInterview({
  kind,
  courseId,
  moduleId = '',
}: {
  kind: GenerationJobKind;
  courseId: string;
  moduleId?: string;
}) {
  const key = conversationKeyFor(kind, courseId, moduleId);
  const agentState = useAgentStore.getState();
  agentState.cancelRequest(key);
  agentState.clearConversation(key);
  useGenerationJobsStore
    .getState()
    .removeJob(jobKeyFor(kind, courseId, moduleId));
}
