import { toText } from '@/shared/lib/text';
import { useMemo, useState, type ChangeEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  checkLessonPractice,
  checkLessonTest,
  generateLessonPractice,
  generateLessonTest,
} from '../api/assessment-api';
import type {
  AssessmentResult,
  LessonTest,
  PracticeAssignment,
  TestAnswers,
  TestQuestion,
} from '../model/types';

const PASSING_SCORE = 61;

function createAnswersPayload(
  questions: TestQuestion[],
  answers: TestAnswers,
  testType: string | undefined,
) {
  return Object.fromEntries(
    questions.map((question, index) => {
      const answer = answers[index];
      const value =
        testType === 'multiple_choice'
          ? (question.options?.[Number(answer)] ?? String(answer ?? ''))
          : String(answer ?? '').trim();
      return [question.id || question.text || String(index + 1), value];
    }),
  );
}

function getErrorMessage(rawError: unknown, fallback: string) {
  const error = rawError as {
    status?: number;
    userMessage?: string;
    message?: string;
  } | null;
  if (error?.status === 403)
    return 'Недостаточно прав для выполнения действия.';
  if (error?.status === 404) return 'Урок или модуль не найден.';
  if (error?.status === 422) {
    console.error('Ошибка валидации ответа ИИ-агента', error);
    return 'Проверьте корректность заполнения и попробуйте ещё раз.';
  }
  if (error?.status === 413) return 'Файл слишком большой.';
  if (Number(error?.status) >= 500) return fallback;
  return error?.userMessage || error?.message || fallback;
}

function ResultCard({
  result,
  passingScore = PASSING_SCORE,
}: {
  result: AssessmentResult | null;
  passingScore?: number;
}) {
  if (!result) return null;
  const passed = Number(result.score) >= passingScore;
  return (
    <article
      className={`lesson-agent-result tw:border-solid tw:border-[rgba(var(--success-rgb),_0.34)] tw:rounded-[16px] tw:p-[16px] tw:grid tw:gap-[10px] tw:[border-width:1px] tw:[&.is-failed]:border-[rgba(var(--danger-rgb,_190,_80,_100),_0.34)] tw:[background:rgba(var(--success-rgb),_0.08)] tw:[box-shadow:inset_0_1px_0_rgba(255,_255,_255,_0.46)] tw:dark:[background:rgba(255,_255,_255,_0.06)] tw:[&.is-failed]:[background:rgba(var(--danger-rgb,_190,_80,_100),_0.08)] tw:dark:[&.is-failed]:[background:rgba(255,_255,_255,_0.06)] ${passed ? 'is-passed' : 'is-failed'}`}
    >
      <div>
        <span className="tw:block tw:text-(--muted) tw:text-[0.78rem]">
          Результат
        </span>
        <strong className="tw:text-(--heading) tw:text-[1.2rem]">
          {Number(result.score) || 0} баллов
        </strong>
      </div>
      <p className="tw:text-[1rem] tw:leading-[1.72] tw:tracking-[0.012em]">
        {passed ? 'Пройдено' : 'Не пройдено'}
      </p>
      {result.ai_feedback && (
        <div className="lesson-agent-feedback tw:text-(--text) tw:leading-[1.56]">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {result.ai_feedback}
          </ReactMarkdown>
        </div>
      )}
    </article>
  );
}

function isWildcardExtensions(extensions: unknown) {
  return (
    !Array.isArray(extensions) ||
    extensions.length === 0 ||
    extensions.includes('*')
  );
}

function normalizeExtension(value: unknown) {
  const extension = toText(value || '')
    .trim()
    .toLowerCase();
  return extension.startsWith('.') ? extension : `.${extension}`;
}

function normalizeAssignmentText(value: unknown) {
  return toText(value || '')
    .replace(/\\n/g, '\n')
    .replace(/\n\s*[-•]\s*/g, '\n- ')
    .trim();
}

export interface LessonAssessmentProps {
  moduleId?: string;
  lessonId?: string;
  onChecked?: (result: AssessmentResult) => void;
}

/** Проверочные вопросы урока: генерация агентом, ответы и проверка. */
export function LessonTestAgent({
  moduleId,
  lessonId,
  onChecked,
}: LessonAssessmentProps) {
  const [test, setTest] = useState<LessonTest | null>(null);
  const [practiceId, setPracticeId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<TestAnswers>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<AssessmentResult | null>(null);

  const startTest = async () => {
    if (!moduleId || !lessonId || isLoading) return;
    setIsLoading(true);
    setError('');
    setResult(null);
    setAnswers({});
    setPracticeId(null);
    setTest(null);

    try {
      const response = await generateLessonTest(moduleId, lessonId);
      setTest(response.practice as LessonTest);
      setPracticeId(response.practiceId);
      if (!response.practiceId) {
        setError(
          'Backend не вернул идентификатор практики для проверки теста.',
        );
      }
    } catch (error) {
      setError(
        getErrorMessage(error, 'Не удалось подготовить проверочные вопросы.'),
      );
    } finally {
      setIsLoading(false);
    }
  };

  const questions = Array.isArray(test?.questions) ? test.questions : [];
  const isSubmitted = Boolean(result);
  const isPassed = Number(result?.score) >= PASSING_SCORE;
  const canSubmit =
    questions.length > 0 &&
    questions.every((_, index) => {
      const answer = answers[index];
      return answer !== undefined && String(answer).trim().length > 0;
    });

  const submitTest = async () => {
    if (!test || !practiceId || !canSubmit || isChecking || isSubmitted) return;
    setIsChecking(true);
    setError('');
    const payload = {
      practice: test,
      answers: createAnswersPayload(questions, answers, test?.test_type),
    };

    try {
      const response = await checkLessonTest(practiceId, payload);
      setResult(response);
      onChecked?.(response);
    } catch (error) {
      setError(
        getErrorMessage(
          error,
          'Не удалось проверить тест. Попробуйте ещё раз.',
        ),
      );
    } finally {
      setIsChecking(false);
    }
  };

  if (!test) {
    return (
      <section className="lesson-agent-panel lesson-agent-start tw:grid tw:gap-[18px] tw:min-h-[260px] tw:p-[clamp(18px,_2.5vw,_28px)] tw:rounded-[18px] tw:[align-content:start] tw:[justify-items:start] tw:[border:1px_solid_rgba(var(--accent-rgb),_0.18)] tw:[background:rgba(255,_255,_255,_0.18)] tw:[&_.btn]:rounded-[999px] tw:[&_.btn]:p-[11px_18px] tw:[&_.btn]:min-w-[170px] tw:[&_.btn]:flex-[0_0_auto] tw:[&_.btn]:whitespace-normal tw:[&_.btn]:w-[auto] tw:[&_.btn]:h-[auto] tw:[&_.btn]:min-h-[44px]">
        <div className="lesson-agent-head tw:grid tw:gap-[6px] tw:max-w-[680px]">
          <p className="course-category tw:m-[0] tw:text-[0.88rem] tw:uppercase tw:tracking-[0.09em] tw:text-(--info-text) tw:font-[700] tw:leading-[1.72]">
            Проверочные вопросы
          </p>
          <h2 className="tw:text-[clamp(1.42rem,_2.4vw,_2rem)] tw:leading-[1.28] tw:tracking-[-0.016em] tw:[font-family:'Unbounded',_sans-serif]">
            Проверка знаний
          </h2>
          <span className="tw:text-(--muted) tw:text-[0.86rem]">
            Когда будете готовы, запустите генерацию тестовых вопросов.
          </span>
        </div>
        {error && (
          <p className="lesson-ai-error" role="alert">
            {error}
          </p>
        )}
        <div className="lesson-agent-actions tw:flex tw:justify-start tw:gap-[10px] tw:items-center tw:w-[auto]">
          <button
            type="button"
            className="btn btn-solid tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:p-[11px_18px] tw:border-solid tw:border-(--cta) tw:font-[700] tw:tracking-[0.01em] tw:text-(--text-solid) tw:flex-[0_0_auto] tw:w-[auto] tw:h-[auto] tw:min-w-[170px] tw:min-h-[44px] tw:whitespace-normal tw:text-[0.96rem] tw:leading-[1.45] tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:var(--cta)] tw:hover:[transform:translateY(-1px)]"
            onClick={startTest}
            disabled={isLoading || !moduleId || !lessonId}
          >
            {isLoading ? 'Готовим вопросы...' : 'Пройти тест'}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="lesson-agent-panel tw:grid tw:gap-[18px]">
      <div className="lesson-agent-head tw:grid tw:gap-[6px] tw:[.lesson-agent-start_&]:max-w-[680px]">
        <p className="course-category tw:m-[0] tw:text-[0.88rem] tw:uppercase tw:tracking-[0.09em] tw:text-(--info-text) tw:font-[700] tw:leading-[1.72]">
          Проверочные вопросы
        </p>
        <h2 className="tw:text-[clamp(1.42rem,_2.4vw,_2rem)] tw:leading-[1.28] tw:tracking-[-0.016em] tw:[font-family:'Unbounded',_sans-serif]">
          {test?.title || 'Проверка знаний'}
        </h2>
        {test?.estimated_time_minutes && (
          <span>Ориентировочное время: {test.estimated_time_minutes} мин.</span>
        )}
      </div>

      {error && (
        <p className="lesson-ai-error" role="alert">
          {error}
        </p>
      )}

      <div className="lesson-agent-question-list tw:grid tw:gap-[14px]">
        {questions.map((question, index) => (
          <article
            className="lesson-agent-question tw:rounded-[16px] tw:p-[16px] tw:grid tw:gap-[14px] tw:[border:1px_solid_rgba(var(--accent-rgb),_0.22)] tw:[background:rgba(255,_255,_255,_0.34)] tw:[box-shadow:inset_0_1px_0_rgba(255,_255,_255,_0.46)] tw:dark:[background:rgba(255,_255,_255,_0.06)]"
            key={`${question.text}-${index}`}
          >
            <div className="lesson-agent-question-title tw:grid tw:grid-cols-[34px_minmax(0,_1fr)_auto] tw:gap-[10px] tw:[align-items:start]">
              <span className="tw:w-[30px] tw:h-[30px] tw:rounded-[50%] tw:grid tw:text-(--ink-accent) tw:font-[900] tw:[place-items:center] tw:[background:rgba(var(--accent-rgb),_0.14)]">
                {index + 1}
              </span>
              <h3 className="tw:text-[clamp(1.08rem,_1.8vw,_1.35rem)] tw:leading-[1.38] tw:tracking-[-0.008em]">
                {question.text}
              </h3>
              {question.points && (
                <small className="tw:text-(--muted) tw:text-[0.86rem]">
                  {question.points} балл.
                </small>
              )}
            </div>

            {test?.test_type === 'multiple_choice' ? (
              <div className="lesson-agent-options tw:grid tw:gap-[10px]">
                {(Array.isArray(question.options) ? question.options : []).map(
                  (option, optionIndex) => (
                    <label
                      className="tw:flex tw:gap-[10px] tw:items-start tw:cursor-pointer tw:text-(--text)"
                      key={`${option}-${optionIndex}`}
                    >
                      <input
                        className="tw:mt-[4px] tw:accent-[rgb(var(--accent-rgb))] tw:text-[0.96rem] tw:leading-[1.45]"
                        type="radio"
                        name={`lesson-test-${lessonId}-${index}`}
                        value={optionIndex}
                        disabled={isSubmitted || isChecking}
                        checked={
                          String(answers[index] ?? '') === String(optionIndex)
                        }
                        onChange={() =>
                          setAnswers((prev) => ({
                            ...prev,
                            [index]: optionIndex,
                          }))
                        }
                      />
                      <span>{option}</span>
                    </label>
                  ),
                )}
              </div>
            ) : (
              <div className="lesson-agent-detailed-answer tw:grid tw:gap-[10px] tw:[&_textarea]:w-[100%] tw:[&_textarea]:min-h-[120px] tw:[&_textarea]:resize-y tw:[&_textarea]:[border:1px_solid_rgba(var(--accent-rgb),_0.25)] tw:[&_textarea]:rounded-[12px] tw:[&_textarea]:[background:rgba(255,_255,_255,_0.56)] tw:[&_textarea]:text-(--text) tw:[&_textarea]:p-[12px] tw:[&_textarea]:[font:inherit] tw:[&_details]:text-(--muted)">
                {question.hint && (
                  <details>
                    <summary>Подсказка</summary>
                    <p>{question.hint}</p>
                  </details>
                )}
                <textarea
                  value={answers[index] || ''}
                  disabled={isSubmitted || isChecking}
                  onChange={(event) =>
                    setAnswers((prev) => ({
                      ...prev,
                      [index]: event.target.value,
                    }))
                  }
                  placeholder="Введите развёрнутый ответ"
                />
              </div>
            )}
          </article>
        ))}
      </div>

      <div className="lesson-agent-actions tw:flex tw:justify-end tw:gap-[10px] tw:[.lesson-agent-start_&]:justify-start tw:[.lesson-agent-start_&]:items-center tw:[.lesson-agent-start_&]:w-[auto]">
        <button
          type="button"
          className="btn btn-solid tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:p-[12px_20px] tw:border-solid tw:border-(--cta) tw:font-[700] tw:tracking-[0.01em] tw:text-(--text-solid) tw:text-[0.96rem] tw:leading-[1.45] tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:var(--cta)] tw:hover:[transform:translateY(-1px)]"
          onClick={submitTest}
          disabled={!practiceId || !canSubmit || isChecking || isSubmitted}
        >
          {isChecking
            ? 'Проверяем...'
            : isSubmitted
              ? isPassed
                ? 'Тест сдан'
                : 'Тест не сдан'
              : 'Завершить тест'}
        </button>
      </div>

      <ResultCard result={result} />
    </section>
  );
}

/** Практическое задание урока: генерация агентом, загрузка решения и проверка. */
export function LessonPracticeAgent({
  moduleId,
  lessonId,
  onChecked,
}: LessonAssessmentProps) {
  const [assignment, setAssignment] = useState<PracticeAssignment | null>(null);
  const [practiceId, setPracticeId] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<AssessmentResult | null>(null);

  const startPractice = async () => {
    if (!moduleId || !lessonId || isLoading) return;
    setIsLoading(true);
    setError('');
    setResult(null);
    setFile(null);
    setFileError('');
    setPracticeId(null);
    setAssignment(null);

    try {
      const response = await generateLessonPractice(moduleId, lessonId);
      setAssignment(response.practice as PracticeAssignment);
      setPracticeId(response.practiceId);
      if (!response.practiceId) {
        setError(
          'Backend не вернул идентификатор практики для проверки задания.',
        );
      }
    } catch (error) {
      setError(
        getErrorMessage(error, 'Не удалось подготовить практическое задание.'),
      );
    } finally {
      setIsLoading(false);
    }
  };

  const allowedExtensions = useMemo<string[]>(
    () =>
      Array.isArray(assignment?.allowed_extensions)
        ? assignment.allowed_extensions
        : [],
    [assignment?.allowed_extensions],
  );
  const acceptsAnyFile = isWildcardExtensions(allowedExtensions);
  const accept = acceptsAnyFile
    ? undefined
    : allowedExtensions.map(normalizeExtension).join(',');

  const pickFile = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] || null;
    setFile(null);
    setFileError('');
    if (!nextFile) return;

    if (!acceptsAnyFile) {
      const fileName = (nextFile.name || '').toLowerCase();
      const isAllowed = allowedExtensions
        .map(normalizeExtension)
        .some((extension) => fileName.endsWith(extension));
      if (!isAllowed) {
        setFileError(
          `Недопустимый тип файла. Разрешены: ${allowedExtensions.join(', ')}.`,
        );
        event.target.value = '';
        return;
      }
    }
    setFile(nextFile);
  };

  const submitPractice = async () => {
    if (!file || !practiceId || fileError || isChecking || result) return;
    setIsChecking(true);
    setError('');
    try {
      const response = await checkLessonPractice(practiceId, assignment, file);
      setResult(response);
      onChecked?.(response);
    } catch (error) {
      setError(
        getErrorMessage(error, 'Не удалось проверить практическое задание.'),
      );
    } finally {
      setIsChecking(false);
    }
  };

  if (!assignment) {
    return (
      <section className="lesson-agent-panel lesson-agent-start tw:grid tw:gap-[18px] tw:min-h-[260px] tw:p-[clamp(18px,_2.5vw,_28px)] tw:rounded-[18px] tw:[align-content:start] tw:[justify-items:start] tw:[border:1px_solid_rgba(var(--accent-rgb),_0.18)] tw:[background:rgba(255,_255,_255,_0.18)] tw:[&_.btn]:rounded-[999px] tw:[&_.btn]:p-[11px_18px] tw:[&_.btn]:min-w-[170px] tw:[&_.btn]:flex-[0_0_auto] tw:[&_.btn]:whitespace-normal tw:[&_.btn]:w-[auto] tw:[&_.btn]:h-[auto] tw:[&_.btn]:min-h-[44px]">
        <div className="lesson-agent-head tw:grid tw:gap-[6px] tw:max-w-[680px]">
          <p className="course-category tw:m-[0] tw:text-[0.88rem] tw:uppercase tw:tracking-[0.09em] tw:text-(--info-text) tw:font-[700] tw:leading-[1.72]">
            Практика
          </p>
          <h2 className="tw:text-[clamp(1.42rem,_2.4vw,_2rem)] tw:leading-[1.28] tw:tracking-[-0.016em] tw:[font-family:'Unbounded',_sans-serif]">
            Практическое задание
          </h2>
          <span className="tw:text-(--muted) tw:text-[0.86rem]">
            Когда будете готовы, запустите подготовку практического задания.
          </span>
        </div>
        {error && (
          <p className="lesson-ai-error" role="alert">
            {error}
          </p>
        )}
        <div className="lesson-agent-actions tw:flex tw:justify-start tw:gap-[10px] tw:items-center tw:w-[auto]">
          <button
            type="button"
            className="btn btn-solid tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:p-[11px_18px] tw:border-solid tw:border-(--cta) tw:font-[700] tw:tracking-[0.01em] tw:text-(--text-solid) tw:flex-[0_0_auto] tw:w-[auto] tw:h-[auto] tw:min-w-[170px] tw:min-h-[44px] tw:whitespace-normal tw:text-[0.96rem] tw:leading-[1.45] tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:var(--cta)] tw:hover:[transform:translateY(-1px)]"
            onClick={startPractice}
            disabled={isLoading || !moduleId || !lessonId}
          >
            {isLoading
              ? 'Готовим задание...'
              : 'Выполнить практическое задание'}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="lesson-agent-panel tw:grid tw:gap-[18px]">
      <div className="lesson-agent-head tw:grid tw:gap-[6px] tw:[.lesson-agent-start_&]:max-w-[680px]">
        <p className="course-category tw:m-[0] tw:text-[0.8rem] tw:uppercase tw:tracking-[0.08em] tw:text-(--accent) tw:font-[700]">
          Практика
        </p>
        <h2>{assignment?.title || 'Практическое задание'}</h2>
      </div>

      {error && (
        <p className="lesson-ai-error" role="alert">
          {error}
        </p>
      )}

      {assignment?.description && (
        <div className="lesson-markdown lesson-agent-description tw:mt-[12px] tw:p-[14px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.3)] tw:rounded-[14px] tw:leading-[1.65] tw:whitespace-normal tw:w-[100%] tw:min-w-[0] tw:max-w-[100%] tw:overflow-x-clip tw:overflow-y-visible tw:[border-width:1px] tw:[background:rgba(255,_255,_255,_0.2)] tw:dark:[.page_&]:border-[rgba(var(--accent-rgb),_0.42)] tw:dark:[.page_&]:[background:rgba(255,_255,_255,_0.045)] tw:dark:[.page_&]:[box-shadow:none] tw:[.lesson-editor-block-select_&_>_:first-child]:mt-[0] tw:[.lesson-editor-block-select_&_>_:last-child]:mb-[0] tw:[&_>_:first-child]:mt-[0] tw:[&_>_:last-child]:mb-[0] tw:[&_p]:max-w-[100%] tw:[&_p]:text-(--muted) tw:[&_p]:leading-[1.5] tw:[&_p]:wrap-anywhere tw:dark:[.page_&_p]:text-[#e9decb] tw:[.page.is-inner-page_&_p]:text-(--text) tw:[.page.is-inner-page_&_p]:text-[clamp(1rem,_1.15vw,_1.08rem)] tw:[.page.is-inner-page_&_p]:leading-[1.82] tw:[.page.is-inner-page_&_p]:tracking-[0.014em] tw:[.page.is-inner-page_&_p]:m-[0_0_18px] tw:[.generated-course-learning-grid_&_pre]:[border:1px_solid_rgba(255,_255,_255,_0.14)] tw:[.generated-course-learning-grid_&_pre]:[background:#0b1020] tw:[.generated-course-learning-grid_&_pre]:text-[#f8fafc] tw:dark:[.page_.generated-course-learning-grid_&&&_pre]:border-[rgba(247,_220,_168,_0.28)] tw:dark:[.page_.generated-course-learning-grid_&&&_pre]:[background:#050816] tw:dark:[.page_.generated-course-learning-grid_&&&_pre]:text-[#f8fafc] tw:[&_pre]:m-[10px_0] tw:[&_pre]:p-[12px] tw:[&_pre]:rounded-[12px] tw:[&_pre]:[background:rgba(0,_0,_0,_0.08)] tw:[&_pre]:overflow-x-auto tw:dark:[.page_&_pre]:[background:rgba(10,_10,_10,_0.72)] tw:dark:[.page_&_pre]:[border:1px_solid_rgba(var(--accent-rgb),_0.32)] tw:dark:[.page_&_pre]:text-[#f2e7d4] tw:[.page.is-inner-page_&_pre]:w-[100%] tw:[.page.is-inner-page_&_pre]:max-w-[100%] tw:[.page.is-inner-page_&_pre]:m-[24px_0] tw:[.page.is-inner-page_&_pre]:p-[20px] tw:[.page.is-inner-page_&_pre]:[border:1px_solid_rgba(91,_111,_138,_0.44)] tw:[.page.is-inner-page_&_pre]:rounded-[14px] tw:[.page.is-inner-page_&_pre]:[background:#202631] tw:[.page.is-inner-page_&_pre]:text-[#d8dee9] tw:[.page.is-inner-page_&_pre]:[box-shadow:0_14px_32px_rgba(31,_38,_49,_0.16),_inset_0_1px_0_rgba(255,_255,_255,_0.05)] tw:[.page.is-inner-page_&_pre]:overflow-x-auto tw:[.page.is-inner-page_&_pre]:overflow-y-hidden tw:[.page.is-inner-page_&_pre]:[overscroll-behavior-inline:contain] tw:[.page.is-inner-page_&_pre]:[tab-size:4] tw:[&_h2]:m-[0_0_10px] tw:[&_h2]:[font-family:'Unbounded',_sans-serif] tw:[&_h2]:text-[0.98rem] tw:[&_h2]:text-(--heading) tw:[.page.is-inner-page_&_h2]:[font-family:'Unbounded',_sans-serif] tw:[.page.is-inner-page_&_h2]:m-[34px_0_16px] tw:[.page.is-inner-page_&_h2]:text-(--heading) tw:[.page.is-inner-page_&_h2]:text-[clamp(1.3rem,_2vw,_1.65rem)] tw:[.page.is-inner-page_&_h2]:leading-[1.38] tw:[.page.is-inner-page_&_ul]:m-[14px_0_22px] tw:[.page.is-inner-page_&_ul]:pl-[28px] tw:[&_li]:max-w-[100%] tw:[&_li]:text-(--muted) tw:[&_li]:leading-[1.5] tw:[&_li]:wrap-anywhere tw:dark:[.page_&_li]:text-[#e9decb] tw:[.page.is-inner-page_&_li]:text-(--text) tw:[.page.is-inner-page_&_li]:text-[clamp(1rem,_1.15vw,_1.08rem)] tw:[.page.is-inner-page_&_li]:leading-[1.82] tw:[.page.is-inner-page_&_li]:tracking-[0.014em] tw:[.page.is-inner-page_&_li]:pl-[5px] tw:[.page.is-inner-page_&_li::marker]:text-(--info-text) tw:[.page.is-inner-page_&_li::marker]:font-[800] tw:[&_p]:mt-[0] tw:[&_p]:mb-[0.85em] tw:[&_ul]:mt-[0] tw:[&_ul]:mb-[0.85em] tw:[&_ol]:mt-[0] tw:[&_ol]:mb-[0.85em] tw:[&_p:last-child]:mb-[0] tw:[&_ul:last-child]:mb-[0] tw:[&_ol:last-child]:mb-[0] tw:[&_h3]:m-[0_0_10px] tw:[&_h3]:[font-family:'Unbounded',_sans-serif] tw:[&_h3]:text-[0.98rem] tw:[&_h3]:text-(--heading) tw:[&_:not(pre)_>_code]:rounded-[7px] tw:[&_:not(pre)_>_code]:[background:rgba(var(--accent-rgb),_0.14)] tw:[&_:not(pre)_>_code]:p-[2px_5px] tw:[&_:not(pre)_>_code]:text-(--ink-accent) tw:[&_:not(pre)_>_code]:whitespace-normal tw:[&_:not(pre)_>_code]:wrap-anywhere tw:dark:[.page_&_td]:text-[#e9decb] tw:dark:[.page_&_:not(pre)_>_code]:[background:rgba(255,_255,_255,_0.09)] tw:dark:[.page_&_:not(pre)_>_code]:text-[#f7dca8] tw:[&_table]:w-[100%] tw:[&_table]:[border-collapse:collapse] tw:[&_table]:m-[12px_0] tw:[&_th]:[border:1px_solid_rgba(var(--accent-rgb),_0.36)] tw:[&_th]:p-[8px_10px] tw:[&_th]:text-left tw:[&_th]:text-[0.86rem] tw:[&_th]:text-(--text) tw:[&_td]:[border:1px_solid_rgba(var(--accent-rgb),_0.36)] tw:[&_td]:p-[8px_10px] tw:[&_td]:text-left tw:[&_td]:text-[0.86rem] tw:[&_td]:text-(--text) tw:[&_th]:[background:rgba(var(--accent-rgb),_0.12)] tw:dark:[.page_&_table]:[background:rgba(12,_12,_12,_0.42)] tw:dark:[.page_&_th]:border-[rgba(var(--accent-rgb),_0.5)] tw:dark:[.page_&_td]:border-[rgba(var(--accent-rgb),_0.5)] tw:dark:[.page_&_th]:[background:rgba(var(--accent-rgb),_0.22)] tw:dark:[.page_&_th]:text-[#fff2df] tw:[&_a]:text-(--ink-accent) tw:[&_a]:font-[700] tw:[&_img]:block tw:[&_img]:max-w-[100%] tw:[&_img]:h-[auto] tw:[&_img]:m-[12px_0] tw:[&_img]:[border:1px_solid_rgba(var(--accent-rgb),_0.28)] tw:[&_img]:rounded-[12px] tw:[&_img]:[background:rgba(255,_255,_255,_0.34)] tw:[.content-preview-image-trigger_&_img]:m-[0] tw:dark:[.page_&_img]:border-[rgba(var(--accent-rgb),_0.46)] tw:dark:[.page_&_img]:[background:rgba(255,_255,_255,_0.08)] tw:[.page.is-inner-page_&_h3]:[font-family:'Unbounded',_sans-serif] tw:[.page.is-inner-page_&_h4]:[font-family:'Unbounded',_sans-serif] tw:[.page.is-inner-page_&_h3]:m-[28px_0_13px] tw:[.page.is-inner-page_&_h3]:text-(--ink-accent) tw:[.page.is-inner-page_&_h3]:text-[clamp(1.08rem,_1.5vw,_1.28rem)] tw:[.page.is-inner-page_&_h3]:leading-[1.45] tw:[.page.is-inner-page_&_h4]:m-[24px_0_11px] tw:[.page.is-inner-page_&_h4]:text-(--info-text) tw:[.page.is-inner-page_&_h4]:text-[1.04rem] tw:[.page.is-inner-page_&_h4]:leading-[1.48] tw:[.page.is-inner-page_&_ol]:m-[14px_0_22px] tw:[.page.is-inner-page_&_ol]:pl-[28px] tw:[.page.is-inner-page_&_li_+_li]:mt-[8px] tw:[.page.is-inner-page_&_em]:text-(--info-text) tw:[.page.is-inner-page_&_a]:text-[#456fa8] tw:[.page.is-inner-page_&_a]:[text-decoration-thickness:1.5px] tw:[.page.is-inner-page_&_a]:[text-underline-offset:3px] tw:[.page.is-inner-page_&_blockquote]:m-[22px_0] tw:[.page.is-inner-page_&_blockquote]:[border-left:4px_solid_#c98245] tw:[.page.is-inner-page_&_blockquote]:rounded-[0_12px_12px_0] tw:[.page.is-inner-page_&_blockquote]:[background:rgba(201,_130,_69,_0.11)] tw:[.page.is-inner-page_&_blockquote]:p-[14px_18px] tw:[.page.is-inner-page_&_blockquote_p]:m-[0] tw:[.page.is-inner-page_&_blockquote_p]:text-[#79502f] tw:[.page.is-inner-page_&_blockquote_strong]:text-[#9a5f2d] tw:[.page.is-inner-page_&_hr]:h-[1px] tw:[.page.is-inner-page_&_hr]:m-[30px_0] tw:[.page.is-inner-page_&_hr]:[border:0] tw:[.page.is-inner-page_&_hr]:[background:linear-gradient(_90deg,_transparent,_rgba(var(--accent-rgb),_0.7),_transparent_)] tw:[.page.is-inner-page_&_table]:w-[100%] tw:[.page.is-inner-page_&_table]:max-w-[100%] tw:[.page.is-inner-page_&_table]:m-[22px_0] tw:[.page.is-inner-page_&_table]:[border-collapse:separate] tw:[.page.is-inner-page_&_table]:[border-spacing:0] tw:[.page.is-inner-page_&_table]:[table-layout:fixed] tw:[.page.is-inner-page_&_th]:p-[12px_14px] tw:[.page.is-inner-page_&_th]:text-[0.96rem] tw:[.page.is-inner-page_&_th]:leading-[1.58] tw:[.page.is-inner-page_&_th]:wrap-anywhere tw:[.page.is-inner-page_&_th]:[word-break:normal] tw:[.page.is-inner-page_&_td]:p-[12px_14px] tw:[.page.is-inner-page_&_td]:text-[0.96rem] tw:[.page.is-inner-page_&_td]:leading-[1.58] tw:[.page.is-inner-page_&_td]:wrap-anywhere tw:[.page.is-inner-page_&_td]:[word-break:normal] tw:[.page.is-inner-page_&_th]:text-(--ink-accent) tw:[.page.is-inner-page_&_th]:[background:rgba(var(--accent-rgb),_0.16)] tw:dark:[.page.is-inner-page_&_h3]:text-[#e5c07b] tw:dark:[.page.is-inner-page_&_h4]:text-[#8fc7ff] tw:dark:[.page.is-inner-page_&_em]:text-[#8fc7ff] tw:dark:[.page.is-inner-page_&_a]:text-[#8fc7ff] tw:dark:[.page.is-inner-page_&_blockquote_p]:text-[#e5c5a7] tw:dark:[.page.is-inner-page_&_blockquote]:[border-left-color:#d0935f] tw:dark:[.page.is-inner-page_&_blockquote]:[background:rgba(208,_147,_95,_0.12)] tw:dark:[.page.is-inner-page_&_blockquote_strong]:text-[#e0a66c] tw:dark:[.page.is-inner-page_&&&_pre]:border-[rgba(143,_155,_170,_0.3)] tw:dark:[.page.is-inner-page_&&&_pre]:[background:#171c24]">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {normalizeAssignmentText(assignment.description)}
          </ReactMarkdown>
        </div>
      )}

      {Array.isArray(assignment?.evaluation_criteria) &&
        assignment.evaluation_criteria.length > 0 && (
          <div className="lesson-agent-meta-card tw:rounded-[16px] tw:p-[16px] tw:[border:1px_solid_rgba(var(--accent-rgb),_0.22)] tw:[background:rgba(255,_255,_255,_0.34)] tw:[box-shadow:inset_0_1px_0_rgba(255,_255,_255,_0.46)] tw:dark:[.page_&]:[background:rgba(255,_255,_255,_0.06)] tw:[&_h3]:text-(--heading) tw:[&_h3]:mb-[8px] tw:[&_ul]:m-[0] tw:[&_ul]:pl-[20px] tw:[&_ul]:text-(--text)">
            <h3>Критерии оценки</h3>
            <ul>
              {assignment.evaluation_criteria.map((item) => (
                <li key={item}>{normalizeAssignmentText(item)}</li>
              ))}
            </ul>
          </div>
        )}

      <div className="lesson-agent-meta-grid tw:grid tw:grid-cols-[repeat(2,_minmax(0,_1fr))] tw:gap-[12px] tw:[&_span]:text-(--muted) tw:[&_span]:text-[0.86rem] tw:[&_>_div]:[border:1px_solid_rgba(var(--accent-rgb),_0.22)] tw:[&_>_div]:rounded-[16px] tw:[&_>_div]:[background:rgba(255,_255,_255,_0.34)] tw:[&_>_div]:[box-shadow:inset_0_1px_0_rgba(255,_255,_255,_0.46)] tw:[&_>_div]:p-[12px_14px] tw:[&_>_div]:grid tw:[&_>_div]:gap-[4px] tw:[&_strong]:text-(--heading) tw:dark:[.page_&_>_div]:[background:rgba(255,_255,_255,_0.06)]">
        <div>
          <span>Проходной балл</span>
          <strong>{assignment?.passing_score ?? PASSING_SCORE}</strong>
        </div>
        <div>
          <span>Форматы</span>
          <strong>
            {acceptsAnyFile ? 'Любой файл' : allowedExtensions.join(', ')}
          </strong>
        </div>
      </div>

      {assignment?.submission_instructions && (
        <div className="lesson-markdown lesson-agent-instructions tw:text-(--muted) tw:leading-[1.5] tw:mt-[12px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.3)] tw:rounded-[14px] tw:p-[14px] tw:w-[100%] tw:min-w-[0] tw:max-w-[100%] tw:overflow-x-clip tw:overflow-y-visible tw:[border-width:1px] tw:[background:rgba(255,_255,_255,_0.2)] tw:dark:[.page_&]:border-[rgba(var(--accent-rgb),_0.42)] tw:dark:[.page_&]:[background:rgba(255,_255,_255,_0.045)] tw:dark:[.page_&]:[box-shadow:none] tw:[.lesson-editor-block-select_&_>_:first-child]:mt-[0] tw:[.lesson-editor-block-select_&_>_:last-child]:mb-[0] tw:[&_>_:first-child]:mt-[0] tw:[&_>_:last-child]:mb-[0] tw:[&_p]:max-w-[100%] tw:[&_p]:text-(--muted) tw:[&_p]:leading-[1.5] tw:[&_p]:wrap-anywhere tw:dark:[.page_&_p]:text-[#e9decb] tw:[.page.is-inner-page_&_p]:text-(--text) tw:[.page.is-inner-page_&_p]:text-[clamp(1rem,_1.15vw,_1.08rem)] tw:[.page.is-inner-page_&_p]:leading-[1.82] tw:[.page.is-inner-page_&_p]:tracking-[0.014em] tw:[.page.is-inner-page_&_p]:m-[0_0_18px] tw:[.generated-course-learning-grid_&_pre]:[border:1px_solid_rgba(255,_255,_255,_0.14)] tw:[.generated-course-learning-grid_&_pre]:[background:#0b1020] tw:[.generated-course-learning-grid_&_pre]:text-[#f8fafc] tw:dark:[.page_.generated-course-learning-grid_&&&_pre]:border-[rgba(247,_220,_168,_0.28)] tw:dark:[.page_.generated-course-learning-grid_&&&_pre]:[background:#050816] tw:dark:[.page_.generated-course-learning-grid_&&&_pre]:text-[#f8fafc] tw:[&_pre]:m-[10px_0] tw:[&_pre]:p-[12px] tw:[&_pre]:rounded-[12px] tw:[&_pre]:[background:rgba(0,_0,_0,_0.08)] tw:[&_pre]:overflow-x-auto tw:dark:[.page_&_pre]:[background:rgba(10,_10,_10,_0.72)] tw:dark:[.page_&_pre]:[border:1px_solid_rgba(var(--accent-rgb),_0.32)] tw:dark:[.page_&_pre]:text-[#f2e7d4] tw:[.page.is-inner-page_&_pre]:w-[100%] tw:[.page.is-inner-page_&_pre]:max-w-[100%] tw:[.page.is-inner-page_&_pre]:m-[24px_0] tw:[.page.is-inner-page_&_pre]:p-[20px] tw:[.page.is-inner-page_&_pre]:[border:1px_solid_rgba(91,_111,_138,_0.44)] tw:[.page.is-inner-page_&_pre]:rounded-[14px] tw:[.page.is-inner-page_&_pre]:[background:#202631] tw:[.page.is-inner-page_&_pre]:text-[#d8dee9] tw:[.page.is-inner-page_&_pre]:[box-shadow:0_14px_32px_rgba(31,_38,_49,_0.16),_inset_0_1px_0_rgba(255,_255,_255,_0.05)] tw:[.page.is-inner-page_&_pre]:overflow-x-auto tw:[.page.is-inner-page_&_pre]:overflow-y-hidden tw:[.page.is-inner-page_&_pre]:[overscroll-behavior-inline:contain] tw:[.page.is-inner-page_&_pre]:[tab-size:4] tw:[&_h2]:m-[0_0_10px] tw:[&_h2]:[font-family:'Unbounded',_sans-serif] tw:[&_h2]:text-[0.98rem] tw:[&_h2]:text-(--heading) tw:[.page.is-inner-page_&_h2]:[font-family:'Unbounded',_sans-serif] tw:[.page.is-inner-page_&_h2]:m-[34px_0_16px] tw:[.page.is-inner-page_&_h2]:text-(--heading) tw:[.page.is-inner-page_&_h2]:text-[clamp(1.3rem,_2vw,_1.65rem)] tw:[.page.is-inner-page_&_h2]:leading-[1.38] tw:[.page.is-inner-page_&_ul]:m-[14px_0_22px] tw:[.page.is-inner-page_&_ul]:pl-[28px] tw:[&_li]:max-w-[100%] tw:[&_li]:text-(--muted) tw:[&_li]:leading-[1.5] tw:[&_li]:wrap-anywhere tw:dark:[.page_&_li]:text-[#e9decb] tw:[.page.is-inner-page_&_li]:text-(--text) tw:[.page.is-inner-page_&_li]:text-[clamp(1rem,_1.15vw,_1.08rem)] tw:[.page.is-inner-page_&_li]:leading-[1.82] tw:[.page.is-inner-page_&_li]:tracking-[0.014em] tw:[.page.is-inner-page_&_li]:pl-[5px] tw:[.page.is-inner-page_&_li::marker]:text-(--info-text) tw:[.page.is-inner-page_&_li::marker]:font-[800] tw:[&_p]:mt-[0] tw:[&_p]:mb-[0.85em] tw:[&_ul]:mt-[0] tw:[&_ul]:mb-[0.85em] tw:[&_ol]:mt-[0] tw:[&_ol]:mb-[0.85em] tw:[&_p:last-child]:mb-[0] tw:[&_ul:last-child]:mb-[0] tw:[&_ol:last-child]:mb-[0] tw:[&_h3]:m-[0_0_10px] tw:[&_h3]:[font-family:'Unbounded',_sans-serif] tw:[&_h3]:text-[0.98rem] tw:[&_h3]:text-(--heading) tw:[&_:not(pre)_>_code]:rounded-[7px] tw:[&_:not(pre)_>_code]:[background:rgba(var(--accent-rgb),_0.14)] tw:[&_:not(pre)_>_code]:p-[2px_5px] tw:[&_:not(pre)_>_code]:text-(--ink-accent) tw:[&_:not(pre)_>_code]:whitespace-normal tw:[&_:not(pre)_>_code]:wrap-anywhere tw:dark:[.page_&_td]:text-[#e9decb] tw:dark:[.page_&_:not(pre)_>_code]:[background:rgba(255,_255,_255,_0.09)] tw:dark:[.page_&_:not(pre)_>_code]:text-[#f7dca8] tw:[&_table]:w-[100%] tw:[&_table]:[border-collapse:collapse] tw:[&_table]:m-[12px_0] tw:[&_th]:[border:1px_solid_rgba(var(--accent-rgb),_0.36)] tw:[&_th]:p-[8px_10px] tw:[&_th]:text-left tw:[&_th]:text-[0.86rem] tw:[&_th]:text-(--text) tw:[&_td]:[border:1px_solid_rgba(var(--accent-rgb),_0.36)] tw:[&_td]:p-[8px_10px] tw:[&_td]:text-left tw:[&_td]:text-[0.86rem] tw:[&_td]:text-(--text) tw:[&_th]:[background:rgba(var(--accent-rgb),_0.12)] tw:dark:[.page_&_table]:[background:rgba(12,_12,_12,_0.42)] tw:dark:[.page_&_th]:border-[rgba(var(--accent-rgb),_0.5)] tw:dark:[.page_&_td]:border-[rgba(var(--accent-rgb),_0.5)] tw:dark:[.page_&_th]:[background:rgba(var(--accent-rgb),_0.22)] tw:dark:[.page_&_th]:text-[#fff2df] tw:[&_a]:text-(--ink-accent) tw:[&_a]:font-[700] tw:[&_img]:block tw:[&_img]:max-w-[100%] tw:[&_img]:h-[auto] tw:[&_img]:m-[12px_0] tw:[&_img]:[border:1px_solid_rgba(var(--accent-rgb),_0.28)] tw:[&_img]:rounded-[12px] tw:[&_img]:[background:rgba(255,_255,_255,_0.34)] tw:[.content-preview-image-trigger_&_img]:m-[0] tw:dark:[.page_&_img]:border-[rgba(var(--accent-rgb),_0.46)] tw:dark:[.page_&_img]:[background:rgba(255,_255,_255,_0.08)] tw:[.page.is-inner-page_&_h3]:[font-family:'Unbounded',_sans-serif] tw:[.page.is-inner-page_&_h4]:[font-family:'Unbounded',_sans-serif] tw:[.page.is-inner-page_&_h3]:m-[28px_0_13px] tw:[.page.is-inner-page_&_h3]:text-(--ink-accent) tw:[.page.is-inner-page_&_h3]:text-[clamp(1.08rem,_1.5vw,_1.28rem)] tw:[.page.is-inner-page_&_h3]:leading-[1.45] tw:[.page.is-inner-page_&_h4]:m-[24px_0_11px] tw:[.page.is-inner-page_&_h4]:text-(--info-text) tw:[.page.is-inner-page_&_h4]:text-[1.04rem] tw:[.page.is-inner-page_&_h4]:leading-[1.48] tw:[.page.is-inner-page_&_ol]:m-[14px_0_22px] tw:[.page.is-inner-page_&_ol]:pl-[28px] tw:[.page.is-inner-page_&_li_+_li]:mt-[8px] tw:[.page.is-inner-page_&_em]:text-(--info-text) tw:[.page.is-inner-page_&_a]:text-[#456fa8] tw:[.page.is-inner-page_&_a]:[text-decoration-thickness:1.5px] tw:[.page.is-inner-page_&_a]:[text-underline-offset:3px] tw:[.page.is-inner-page_&_blockquote]:m-[22px_0] tw:[.page.is-inner-page_&_blockquote]:[border-left:4px_solid_#c98245] tw:[.page.is-inner-page_&_blockquote]:rounded-[0_12px_12px_0] tw:[.page.is-inner-page_&_blockquote]:[background:rgba(201,_130,_69,_0.11)] tw:[.page.is-inner-page_&_blockquote]:p-[14px_18px] tw:[.page.is-inner-page_&_blockquote_p]:m-[0] tw:[.page.is-inner-page_&_blockquote_p]:text-[#79502f] tw:[.page.is-inner-page_&_blockquote_strong]:text-[#9a5f2d] tw:[.page.is-inner-page_&_hr]:h-[1px] tw:[.page.is-inner-page_&_hr]:m-[30px_0] tw:[.page.is-inner-page_&_hr]:[border:0] tw:[.page.is-inner-page_&_hr]:[background:linear-gradient(_90deg,_transparent,_rgba(var(--accent-rgb),_0.7),_transparent_)] tw:[.page.is-inner-page_&_table]:w-[100%] tw:[.page.is-inner-page_&_table]:max-w-[100%] tw:[.page.is-inner-page_&_table]:m-[22px_0] tw:[.page.is-inner-page_&_table]:[border-collapse:separate] tw:[.page.is-inner-page_&_table]:[border-spacing:0] tw:[.page.is-inner-page_&_table]:[table-layout:fixed] tw:[.page.is-inner-page_&_th]:p-[12px_14px] tw:[.page.is-inner-page_&_th]:text-[0.96rem] tw:[.page.is-inner-page_&_th]:leading-[1.58] tw:[.page.is-inner-page_&_th]:wrap-anywhere tw:[.page.is-inner-page_&_th]:[word-break:normal] tw:[.page.is-inner-page_&_td]:p-[12px_14px] tw:[.page.is-inner-page_&_td]:text-[0.96rem] tw:[.page.is-inner-page_&_td]:leading-[1.58] tw:[.page.is-inner-page_&_td]:wrap-anywhere tw:[.page.is-inner-page_&_td]:[word-break:normal] tw:[.page.is-inner-page_&_th]:text-(--ink-accent) tw:[.page.is-inner-page_&_th]:[background:rgba(var(--accent-rgb),_0.16)] tw:dark:[.page.is-inner-page_&_h3]:text-[#e5c07b] tw:dark:[.page.is-inner-page_&_h4]:text-[#8fc7ff] tw:dark:[.page.is-inner-page_&_em]:text-[#8fc7ff] tw:dark:[.page.is-inner-page_&_a]:text-[#8fc7ff] tw:dark:[.page.is-inner-page_&_blockquote_p]:text-[#e5c5a7] tw:dark:[.page.is-inner-page_&_blockquote]:[border-left-color:#d0935f] tw:dark:[.page.is-inner-page_&_blockquote]:[background:rgba(208,_147,_95,_0.12)] tw:dark:[.page.is-inner-page_&_blockquote_strong]:text-[#e0a66c] tw:dark:[.page.is-inner-page_&&&_pre]:border-[rgba(143,_155,_170,_0.3)] tw:dark:[.page.is-inner-page_&&&_pre]:[background:#171c24]">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {normalizeAssignmentText(assignment.submission_instructions)}
          </ReactMarkdown>
        </div>
      )}

      <label className="lesson-agent-file-picker tw:rounded-[16px] tw:p-[14px] tw:grid tw:gap-[8px] tw:text-(--text) tw:[border:1px_solid_rgba(var(--accent-rgb),_0.22)] tw:[background:rgba(255,_255,_255,_0.34)] tw:[box-shadow:inset_0_1px_0_rgba(255,_255,_255,_0.46)] tw:dark:[.page_&]:[background:rgba(255,_255,_255,_0.06)] tw:[&_>_span]:text-(--heading) tw:[&_>_span]:font-[800] tw:[&_input]:text-(--text)">
        <span>Файл решения</span>
        <input
          type="file"
          accept={accept}
          disabled={isChecking || Boolean(result)}
          onChange={pickFile}
        />
        {file && <strong>{file.name}</strong>}
      </label>
      {fileError && (
        <p className="lesson-ai-error" role="alert">
          {fileError}
        </p>
      )}

      <div className="lesson-agent-actions tw:flex tw:justify-end tw:gap-[10px] tw:[.lesson-agent-start_&]:justify-start tw:[.lesson-agent-start_&]:items-center tw:[.lesson-agent-start_&]:w-[auto]">
        <button
          type="button"
          className="btn btn-solid tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:p-[12px_20px] tw:border-solid tw:border-(--cta) tw:font-[700] tw:tracking-[0.01em] tw:text-(--text-solid) tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:var(--cta)] tw:hover:[transform:translateY(-1px)]"
          onClick={submitPractice}
          disabled={
            !practiceId ||
            !file ||
            Boolean(fileError) ||
            isChecking ||
            Boolean(result)
          }
        >
          {isChecking
            ? 'Отправляем...'
            : result
              ? 'Отправлено'
              : 'Отправить на проверку'}
        </button>
      </div>

      <ResultCard
        result={result}
        passingScore={assignment?.passing_score ?? PASSING_SCORE}
      />
    </section>
  );
}
