import { CodeEditor } from '@/shared/ui/code-editor';
import { TrainingMentor } from './TrainingMentor';
import { useEffect, useState } from 'react';
import {
  ContentBlocks,
  CollapsedCourseContents,
  CourseNavigationTree,
  LessonBasicInfo,
} from '@/entities/course';
import { useUiLayoutStore } from '@/shared/lib/ui-layout';
import { ChatButton } from '@/shared/ui/ai-chat';

const blocks = [
  {
    id: 'training-module-1',
    title: 'Знакомство с Python',
    practice: [],
    lessons: [
      'Установка Python',
      'Переменные и типы данных',
      'Условия и ветвления',
      'Циклы',
    ].map((title, i) => ({ id: `training-lesson-${i + 1}`, title })),
  },
  {
    id: 'training-module-2',
    title: 'Коллекции и функции',
    practice: [],
    lessons: ['Списки', 'Словари', 'Функции', 'Итоговая практика'].map(
      (title, i) => ({ id: `training-lesson-${i + 5}`, title }),
    ),
  },
];
const course = { title: 'Основы Python для начинающих', blocks };
const example =
  'name = "Анна"\nage = 24\nis_student = True\n\nprint(name, age, is_student)';
const questions = [
  {
    title: 'Какой тип у значения 3.14?',
    options: [
      'int — целое число',
      'float — число с дробной частью',
      'str — строка',
      'bool — логическое значение',
    ],
    correct: 1,
    explanation: 'float хранит числа с дробной частью.',
  },
  {
    title: 'Какая запись создаёт переменную name?',
    options: [
      'name == "Анна"',
      'name = "Анна"',
      '"Анна" = name',
      'print(name)',
    ],
    correct: 1,
    explanation: 'Один знак равенства присваивает значение переменной.',
  },
  {
    title: 'Какая функция показывает тип значения?',
    options: ['print()', 'str()', 'type()', 'input()'],
    correct: 2,
    explanation: 'Функция type() возвращает тип значения.',
  },
];
const theory =
  'В этом уроке разберёмся, как Python хранит данные и как выбрать подходящий тип для числа, текста и логического значения.\n\n## Что такое переменная\n\nПеременная — это имя, с которым связано значение. Оно помогает сохранить результат вычисления и использовать его позже.\n\nЧтобы создать переменную, укажите имя, знак равенства и значение.\n\n```python\nname = "Анна"\nage = 24\nis_student = True\n\nprint(name)  # Анна\n```\n\n## Основные типы данных\n\n| Тип | Пример | Для чего нужен |\n| --- | --- | --- |\n| int | 24 | Целые числа |\n| float | 3.14 | Дробные числа |\n| str | "Анна" | Текстовые строки |\n| bool | True / False | Логические значения |\n\n## Как проверить тип\n\nФункция `type()` показывает тип переданного ей значения.\n\n```python\nprice = 1490.50\nprint(type(price))  # <class \'float\'>\n```\n\n## Запомните\n\nИспользуйте понятные имена: `course_title` вместо `x`.\n\n## Как связаны имя и значение\n\n`age → 24`\n\nИмя переменной указывает на сохранённое значение.\n\n## Итоги\n\n- Переменная связывает имя со значением.\n- Основные типы: int, float, str и bool.\n- Проверить тип можно с помощью type().\n\n[Источник: Python Docs — Built-in Types](https://docs.python.org/3/library/stdtypes.html)';

/** Готовый учебный пример: не создаёт курс, задания или прогресс на сервере. */
export function TrainingLesson({
  onBack,
  onFinish,
}: {
  onBack: () => void;
  onFinish: () => void;
}) {
  const [selected, setSelected] = useState('training-lesson-2');
  const [collapsed, setCollapsed] = useState(false);
  const [choice, setChoice] = useState<number | null>(null);
  const [checked, setChecked] = useState(false);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [testPassed, setTestPassed] = useState(false);
  const question = questions[questionIndex];
  const [code, setCode] = useState(example);
  const [practiceResult, setPracticeResult] = useState('');
  const activeTab = useUiLayoutStore((state) =>
    state.getLessonActiveTab(selected),
  );
  const setTab = useUiLayoutStore((state) => state.setLessonActiveTab);
  useEffect(() => {
    setTab('training-lesson-2', 'theory');
  }, [setTab]);
  const block =
    blocks.find((item) =>
      item.lessons.some((lesson) => lesson.id === selected),
    ) || blocks[0];
  const lesson =
    block.lessons.find((item) => item.id === selected) || block.lessons[0];
  const [completed, setCompleted] = useState<Record<string, boolean>>({
    'training-lesson-1': true,
  });
  const progress = {
    'training-lesson-1': {
      id: 'training-progress-1',
      lessonId: 'training-lesson-1',
      moduleProgressId: 'training-module-1',
      theoryCompletedAt: 'done',
      testCompletedAt: 'done',
      practiceCompletedAt: 'done',
    },
    [selected]: {
      id: `training-progress-${selected}`,
      lessonId: selected,
      moduleProgressId: block.id,
      theoryCompletedAt: 'done',
      testCompletedAt: testPassed ? 'done' : null,
      practiceCompletedAt: completed[selected] ? 'done' : null,
    },
  };

  function openLesson(id: string) {
    setSelected(id);
    setTab(id, 'theory');
    setChoice(null);
    setChecked(false);
    setQuestionIndex(0);
    setTestPassed(false);
    setPracticeResult('');
  }

  return (
    <section
      className="training-lesson"
      data-training-lesson-step={
        practiceResult.startsWith('Учебный пример готов')
          ? 5
          : activeTab === 'theory'
            ? 0
            : activeTab === 'questions'
              ? 3
              : 4
      }
    >
      <div className="tw:mb-[20px] tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-[12px] tw:text-[14px] tw:text-(--muted)">
        <span>Пробный курс · готовый учебный пример</span>
        <div className="tw:flex tw:flex-wrap tw:gap-[16px]">
          <button
            type="button"
            onClick={onBack}
            className="tw:border-0 tw:bg-transparent tw:text-(--text) tw:cursor-pointer"
          >
            К учебному чату
          </button>
          <button
            type="button"
            onClick={onFinish}
            data-training-finish
            className="tw:border-0 tw:bg-transparent tw:text-(--text) tw:cursor-pointer"
          >
            Завершить знакомство
          </button>
        </div>
      </div>
      <div
        className={`tw:grid tw:items-start tw:gap-[24px] tw:max-760:grid-cols-1 ${collapsed ? 'tw:grid-cols-[40px_minmax(0,1fr)]' : 'tw:grid-cols-[288px_minmax(0,1fr)]'}`}
      >
        {collapsed ? (
          <CollapsedCourseContents onExpand={() => setCollapsed(false)} />
        ) : (
          <CourseNavigationTree
            selectedCourse={course}
            selectedBlock={block}
            selectedLessonId={selected}
            completedLessons={completed}
            completedPractices={{}}
            openBlock={(id) =>
              openLesson(
                blocks.find((item) => item.id === id)?.lessons[0].id ||
                  selected,
              )
            }
            openLesson={openLesson}
            openPractice={() => {}}
            onCollapse={() => setCollapsed(true)}
            lessonProgressById={progress}
          />
        )}
        <article className="training-lesson-content tw:min-w-0 tw:rounded-[24px] tw:border tw:border-solid tw:border-(--glass-border) tw:bg-(--panel-bg) tw:p-[28px] tw:max-760:p-[20px] tw:[&_h2]:[font-family:Unbounded,sans-serif] tw:[&_h3]:[font-family:Unbounded,sans-serif]">
          <LessonBasicInfo
            compact
            lesson={{
              ...lesson,
              order: block.lessons.indexOf(lesson),
              estimated_time_minutes: 12,
            }}
            level="Начальный"
          />
          {activeTab === 'theory' ? (
            <>
              <ContentBlocks
                presentation="document"
                blocks={[
                  {
                    content_type: 'text',
                    md_content:
                      selected === 'training-lesson-2'
                        ? theory
                        : `## ${lesson.title}\n\nВы открыли другой урок из дерева. В рабочем курсе здесь будет его материал. В пробном примере теория, вопросы и практика показаны на уроке «Переменные и типы данных».`,
                  },
                ]}
              />
              <div className="tw:mt-[28px]">
                <ChatButton
                  variant="primary"
                  onClick={() => setTab(selected, 'questions')}
                >
                  Перейти к вопросам
                </ChatButton>
              </div>
            </>
          ) : activeTab === 'questions' ? (
            <>
              <h2 className="tw:text-[24px] tw:[font-family:Unbounded,sans-serif]">
                Проверочные вопросы
              </h2>
              <p className="tw:my-[20px] tw:text-(--muted)">
                Закрепите материал урока. Можно вернуться к теории.
              </p>
              <span className="tw:inline-block tw:rounded-full tw:border tw:border-solid tw:border-(--navigation-active-border) tw:bg-(--navigation-active) tw:px-[12px] tw:py-[5px] tw:text-[12px] tw:text-(--eyebrow)">
                Вопрос {questionIndex + 1} из {questions.length}
              </span>
              <h3 className="tw:my-[24px] tw:text-[20px]">{question.title}</h3>
              <div className="tw:grid tw:gap-[10px]">
                {question.options.map((text, index) => (
                  <label
                    key={text}
                    className={`tw:flex tw:items-center tw:gap-[12px] tw:rounded-[14px] tw:border tw:border-solid tw:p-[16px] tw:cursor-pointer ${choice === index ? 'tw:border-(--navigation-active-border) tw:bg-(--navigation-active)' : 'tw:border-(--line)'}`}
                  >
                    <input
                      type="radio"
                      name="training-type"
                      checked={choice === index}
                      onChange={() => {
                        setChoice(index);
                        setChecked(false);
                      }}
                    />
                    {text}
                  </label>
                ))}
              </div>
              {checked && (
                <p role="status" className="tw:mt-[20px]">
                  {choice === question.correct
                    ? `Верно: ${question.explanation}`
                    : 'Попробуйте ещё раз или вернитесь к теории.'}
                </p>
              )}
              <div className="tw:mt-[28px] tw:flex tw:flex-wrap tw:gap-[12px] tw:[&_.ai-chat-btn]:min-h-[46px] tw:[&_.ai-chat-btn]:px-[28px] tw:[&_.ai-chat-btn]:text-[14px]">
                <ChatButton
                  variant="primary"
                  disabled={
                    choice === null || (checked && choice === question.correct)
                  }
                  onClick={() => {
                    setChecked(true);
                    if (
                      choice === question.correct &&
                      questionIndex === questions.length - 1
                    )
                      setTestPassed(true);
                  }}
                >
                  Проверить ответ
                </ChatButton>
                {checked &&
                  choice === question.correct &&
                  questionIndex < questions.length - 1 && (
                    <ChatButton
                      variant="primary"
                      onClick={() => {
                        setQuestionIndex((value) => value + 1);
                        setChoice(null);
                        setChecked(false);
                      }}
                    >
                      Следующий вопрос
                    </ChatButton>
                  )}
                <ChatButton onClick={() => setTab(selected, 'theory')}>
                  К теории
                </ChatButton>
              </div>
            </>
          ) : (
            <>
              <h2 className="tw:mb-[28px] tw:text-[24px] tw:[font-family:Unbounded,sans-serif]">
                Практика
              </h2>
              <h3 className="tw:text-[20px]">Карточка студента</h3>
              <p className="tw:my-[20px] tw:leading-[1.7]">
                Создайте переменные name, age и is_student. Выведите имя,
                возраст и статус обучения с помощью функции print().
              </p>
              <label
                htmlFor="training-solution"
                className="tw:mb-[12px] tw:block tw:text-[13px] tw:text-(--muted)"
              >
                Ваше решение
              </label>
              <CodeEditor
                id="training-solution"
                label="Решение учебной практики"
                language="PYTHON"
                value={code}
                onChange={(value) => {
                  setCode(value);
                  setPracticeResult('');
                }}
              />
              {practiceResult && (
                <p role="status" className="tw:mt-[20px]">
                  {practiceResult}
                </p>
              )}
              <div className="tw:mt-[24px] tw:flex tw:flex-wrap tw:gap-[12px] tw:[&_.ai-chat-btn]:min-h-[46px] tw:[&_.ai-chat-btn]:px-[28px] tw:[&_.ai-chat-btn]:text-[14px]">
                <ChatButton
                  variant="primary"
                  data-training-check
                  onClick={() => {
                    const valid = ['name', 'age', 'is_student', 'print('].every(
                      (part) => code.includes(part),
                    );
                    setPracticeResult(
                      valid
                        ? 'Учебный пример готов! Теперь можно перейти к следующему уроку.'
                        : 'Добавьте переменные name, age, is_student и вызов print().',
                    );
                    if (valid)
                      setCompleted((previous) => ({
                        ...previous,
                        [selected]: true,
                      }));
                  }}
                >
                  Проверить решение
                </ChatButton>
                <ChatButton onClick={() => setTab(selected, 'theory')}>
                  К теории
                </ChatButton>
              </div>
            </>
          )}
        </article>
      </div>
      <TrainingMentor />
    </section>
  );
}
