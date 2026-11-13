import { useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useSessionStore } from '@/entities/session';
import {
  ChatButton,
  ChatComposer,
  ChatMessage,
  ChatThread,
} from '@/shared/ui/ai-chat';
import { intakeQuestions } from '../config/intake-questions';
import { TrainingLesson } from './TrainingLesson';
import { useTrainingStore } from '../model/training-store';
import { ConfirmDialog } from '@/shared/ui/confirm-dialog';
import {
  DOCUMENT_ALLOWED_EXTENSION,
  DOCUMENT_MAX_SIZE_BYTES,
} from '@/shared/api';

const examples = [
  'Основы Python для начинающих',
  'Научиться писать простые программы на Python',
  '2 недели',
  'Теория и практика',
  'Начальный',
  'Начинающие без опыта программирования',
  'Без дополнительных материалов',
];

/** Изолированное знакомство: ответы и пробный курс живут только на этой странице. */
export function CreatorTrainingView() {
  const [search] = useSearchParams();
  const owner = useSessionStore((state) => String(state.user?.id || ''));
  const saveCourse = useTrainingStore((state) => state.save);
  const completeCourse = useTrainingStore((state) => state.complete);
  const [finished, setFinished] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [courseReady, setCourseReady] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<
    { id: string; name: string; meta: string }[]
  >([]);
  const [fileError, setFileError] = useState('');
  const [clearOpen, setClearOpen] = useState(false);
  const [answers, setAnswers] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [lessonOpen, setLessonOpen] = useState(search.get('lesson') === '1');
  const [messages, setMessages] = useState<
    { role: 'user' | 'assistant'; text: string }[]
  >([{ role: 'assistant', text: intakeQuestions[0].prompt }]);
  const question = intakeQuestions[answers.length];
  const complete = answers.length === intakeQuestions.length;

  function submit(value = input) {
    const text =
      value.trim() ||
      (files.length
        ? `Материалы: ${files.map((file) => file.name).join(', ')}`
        : '');
    if (!text || !question) return;
    const next = [...answers, text];
    setAnswers(next);
    setInput('');
    setFiles([]);
    setMessages((previous) => [
      ...previous,
      { role: 'user', text },
      {
        role: 'assistant',
        text:
          intakeQuestions[next.length]?.prompt ||
          'Описание готово. В рабочем чате здесь нужно проверить программу и подтвердить генерацию. В знакомстве можно сразу открыть пробный курс.',
      },
    ]);
  }

  if (finished)
    return (
      <article className="tw:max-w-[860px] tw:rounded-[24px] tw:border tw:border-solid tw:border-(--glass-border) tw:bg-(--panel-bg) tw:p-[36px] tw:max-760:p-[24px]">
        <p className="tw:mt-0 tw:mb-[24px] tw:text-[12px] tw:font-bold tw:uppercase tw:text-(--progress-done)">
          Обучение пройдено
        </p>
        <h2 className="tw:text-[30px] tw:leading-[1.4] tw:[font-family:Unbounded,sans-serif]">
          Вы готовы к своему курсу
        </h2>
        <p className="tw:my-[24px] tw:leading-[1.7]">
          Вы открыли пробный курс и познакомились с теорией, вопросами и
          практикой. Учебный пример доступен в «Моих курсах» в этом браузере.
        </p>
        <h3 className="tw:mb-[20px] tw:text-[20px]">Что дальше?</h3>
        <div className="tw:grid tw:max-w-[380px] tw:gap-[14px]">
          {[
            ['/drag-and-drop-course', 'Собрать курс из материалов'],
            ['/quick-start', 'Открыть быстрый старт'],
            ['/my-courses', 'Перейти в мои курсы'],
          ].map(([to, text], index) => (
            <Link
              key={to}
              to={to}
              className={`tw:rounded-full tw:border tw:border-solid tw:border-(--line) tw:px-[24px] tw:py-[14px] tw:text-center tw:text-[14px] tw:font-semibold tw:no-underline ${index === 0 ? 'tw:bg-(--contrast) tw:text-(--text-solid)' : 'tw:text-(--text)'}`}
            >
              {text}
            </Link>
          ))}
        </div>
      </article>
    );
  if (lessonOpen)
    return (
      <TrainingLesson
        onBack={() => setLessonOpen(false)}
        onFinish={() => {
          if (!useTrainingStore.getState().courses[owner])
            saveCourse(owner, examples);
          completeCourse(owner);
          setFinished(true);
        }}
      />
    );

  return (
    <>
      <h1 className="tw:sr-only">Знакомство с созданием курса</h1>
      <div className="tw:mb-[18px] tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-[12px] tw:text-[14px] tw:text-(--muted)">
        <span>
          {complete
            ? 'Знакомство завершено'
            : `Знакомство · шаг ${answers.length + 1} из ${intakeQuestions.length}`}
        </span>
        <Link to="/quick-start" className="tw:text-(--text)">
          Завершить знакомство
        </Link>
      </div>
      <div className="tw:min-w-0">
        <article
          data-training-step={courseReady ? 8 : answers.length}
          className="creator-training tw:flex tw:h-[calc(100dvh_-_260px)] tw:min-h-[480px] tw:flex-col tw:overflow-hidden tw:rounded-[22px] tw:border tw:border-solid tw:border-(--glass-border) tw:bg-(--panel-bg)"
        >
          <header className="tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-[12px] tw:border-0 tw:border-b tw:border-solid tw:border-(--line) tw:px-[22px] tw:py-[18px]">
            <h2 className="tw:m-0 tw:text-[20px] tw:[font-family:Unbounded,sans-serif]">
              Чат-конструктор
            </h2>
            <span className="tw:text-[12px] tw:text-(--eyebrow)">
              Знакомство · без запросов к ИИ
            </span>
          </header>
          <ChatThread
            scrollKey={messages.length}
            label="Учебный чат создания курса"
          >
            <div className="tw:mx-auto tw:flex tw:w-full tw:flex-col tw:gap-[18px]">
              {messages.map((message, index) => (
                <ChatMessage
                  key={index}
                  {...message}
                  copyable={false}
                  size="md"
                />
              ))}
              {complete && !courseReady && (
                <div className="tw:mt-[12px] tw:border-0 tw:border-t tw:border-solid tw:border-(--line) tw:pt-[22px]">
                  <h3 className="tw:text-[22px]">{answers[0]}</h3>
                  <dl className="tw:grid tw:gap-[12px]">
                    {intakeQuestions.slice(1).map((item, index) => (
                      <div key={item.id}>
                        <dt className="tw:text-[12px] tw:text-(--muted)">
                          {
                            [
                              'Цель',
                              'Длительность',
                              'Формат',
                              'Уровень',
                              'Аудитория',
                              'Материалы',
                            ][index]
                          }
                        </dt>
                        <dd className="tw:ml-0 tw:mt-[4px]">
                          {answers[index + 1]}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <ChatButton
                    data-training-next
                    variant="primary"
                    onClick={() => {
                      setConfirmOpen(true);
                    }}
                  >
                    Проверить и запустить
                  </ChatButton>
                </div>
              )}
              {courseReady && (
                <div className="tw:grid tw:gap-[18px]">
                  <ChatMessage
                    role="assistant"
                    size="md"
                    copyable={false}
                    text="Пробный курс готов. В нём есть теория, проверочные вопросы и практика."
                  />
                  <div className="tw:flex tw:flex-wrap tw:gap-[12px]">
                    <ChatButton
                      data-training-next
                      variant="primary"
                      onClick={() => setLessonOpen(true)}
                    >
                      Открыть пробный курс
                    </ChatButton>
                    <ChatButton
                      onClick={() => {
                        setAnswers([]);
                        setInput('');
                        setCourseReady(false);
                        setMessages([
                          {
                            role: 'assistant',
                            text: intakeQuestions[0].prompt,
                          },
                        ]);
                      }}
                    >
                      Новый чат
                    </ChatButton>
                  </div>
                </div>
              )}
              <div
                data-help-slot="creatorTraining"
                className="tw:w-full tw:min-w-0 tw:max-w-[760px] tw:self-start tw:empty:hidden"
              />
            </div>
          </ChatThread>
          {!complete && question && (
            <div className="tw:shrink-0 tw:px-[20px] tw:pb-[18px]">
              <div className="tw:mb-[12px] tw:flex tw:flex-wrap tw:gap-[8px]">
                <ChatButton
                  data-training-next
                  size="sm"
                  onClick={() => submit(examples[answers.length])}
                >
                  Ответить примером
                </ChatButton>
                {(question.quickOptions || [examples[answers.length]]).map(
                  (option) => (
                    <ChatButton
                      key={option}
                      size="sm"
                      onClick={() => setInput(option)}
                    >
                      {option}
                    </ChatButton>
                  ),
                )}
              </div>
              <ChatComposer
                className="tw:[&_.ai-chat-input]:text-[16px]"
                value={input}
                onChange={setInput}
                onSubmit={() => submit()}
                placeholder={question.placeholder}
                showSendLabel
                sendLabel="Отправить"
                onAttach={() => fileRef.current?.click()}
                attachLabel="Прикрепить файлы в учебном чате"
                files={files}
                onRemoveFile={(id) =>
                  setFiles((previous) =>
                    previous.filter((file) => file.id !== id),
                  )
                }
                canSubmit={Boolean(input.trim() || files.length)}
                ariaLabel="Ответ в учебном чате"
                hint={`Файлов прикреплено: ${files.length} · Enter — отправить, Shift + Enter — новая строка · Учебные файлы остаются в браузере`}
              />
              <input
                ref={fileRef}
                type="file"
                multiple
                accept=".pdf,.docx,.pptx,.xlsx,.md,.html,.txt,.json"
                className="tw:hidden"
                aria-label="Учебные материалы"
                onChange={(event) => {
                  const selected = Array.from(event.target.files || []);
                  event.target.value = '';
                  if (
                    selected.some(
                      (file) =>
                        !DOCUMENT_ALLOWED_EXTENSION.test(file.name) ||
                        file.size > DOCUMENT_MAX_SIZE_BYTES,
                    )
                  ) {
                    setFileError(
                      'Выберите поддерживаемые документы размером до 30 МБ.',
                    );
                    return;
                  }
                  const next = [
                    ...new Map(
                      [
                        ...files,
                        ...selected.map((file) => ({
                          id: `${file.name}:${file.size}:${file.lastModified}`,
                          name: file.name,
                          meta: `${Math.max(1, Math.ceil(file.size / 1024))} КБ`,
                        })),
                      ].map((file) => [file.id, file]),
                    ).values(),
                  ];
                  if (next.length > 5) {
                    setFileError('Можно прикрепить до пяти файлов.');
                    return;
                  }
                  setFileError('');
                  setFiles(next);
                }}
              />
              {fileError && (
                <p
                  role="alert"
                  className="tw:mt-[10px] tw:text-[14px] tw:text-(--muted)"
                >
                  {fileError}
                </p>
              )}
              <div className="tw:mt-[12px] tw:flex tw:justify-end">
                <ChatButton onClick={() => setClearOpen(true)}>
                  Очистить чат
                </ChatButton>
              </div>
            </div>
          )}
        </article>
      </div>
      <ConfirmDialog
        open={confirmOpen}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          saveCourse(owner, answers);
          setCourseReady(true);
          setConfirmOpen(false);
        }}
        title="Запустить генерацию курса?"
        eyebrow="Проверьте перед запуском"
        className="tw:my-auto tw:w-[min(740px,100%)]!"
        description="В знакомстве откроется подготовленный курс. ИИ не вызывается."
        confirmLabel="Подтвердить и запустить"
        size="lg"
      >
        <h3 className="tw:text-[22px]">{answers[0]}</h3>
        <p className="tw:text-(--muted) tw:leading-[1.7]">{answers[1]}</p>
      </ConfirmDialog>
      <ConfirmDialog
        open={clearOpen}
        onCancel={() => setClearOpen(false)}
        onConfirm={() => {
          setAnswers([]);
          setInput('');
          setFiles([]);
          setFileError('');
          setCourseReady(false);
          setMessages([{ role: 'assistant', text: intakeQuestions[0].prompt }]);
          setClearOpen(false);
        }}
        title="Очистить учебный чат?"
        description="Учебную переписку можно будет пройти заново."
        confirmLabel="Очистить"
        danger
      />
    </>
  );
}
