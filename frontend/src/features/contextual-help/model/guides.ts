export interface HelpStep {
  title: string;
  text: string;
  target: string;
  waitForTarget?: boolean;
  action?: string;
  reveal?: string | string[];
  revealAlways?: boolean;
  anchor?: string;
  placement?: 'below-end' | 'right-start';
  optional?: boolean;
}
export interface HelpGuide {
  label: string;
  steps: HelpStep[];
}
export const helpGuides = {
  home: {
    label: 'Знакомство с платформой',
    steps: [
      {
        title: 'Настройте главное меню',
        text: 'Слева находятся основные разделы платформы. Стрелка рядом с логотипом сворачивает меню до значков и освобождает место. Нажмите её ещё раз, чтобы вернуть подписи. На узком экране меню уже показано значками.',
        target:
          '.main-navigation [data-help="toggle-navigation"], .main-navigation',
        reveal:
          '.main-navigation [data-help="toggle-navigation"][aria-expanded="false"]',
        revealAlways: true,
        anchor: '.main-navigation [data-help="toggle-navigation"]',
        placement: 'right-start',
      },
      {
        title: 'Выберите удобную тему',
        text: 'Эта кнопка переключает светлую и тёмную тему. Попробуйте обе и оставьте удобную — выбор сохранится в этом браузере.',
        target: '.header [data-help="toggle-theme"]',
        placement: 'below-end',
      },
      {
        title: 'Оставьте обратную связь',
        text: 'Через «Обратную связь» можно оценить платформу, сообщить о проблеме или предложить улучшение. Кнопка доступна из любого раздела.',
        target: '.header [data-help="feedback"]',
        placement: 'below-end',
      },
      {
        title: 'Профиль',
        text: 'Здесь находятся данные аккаунта: имя, никнейм, почта и аватар. В профиле также можно вернуться к активному курсу.',
        target: '.main-navigation a[href="/profile"]',
        optional: true,
      },
      {
        title: 'Курсы',
        text: 'Каталог готовых программ. Выбирайте тему и уровень, открывайте описание курса и переходите к обучению.',
        target: '.main-navigation a[href="/courses"]',
        optional: true,
      },
      {
        title: 'Мои курсы',
        text: 'Здесь собраны ваши программы и курсы, к которым вы присоединились. Открывайте их, чтобы продолжить обучение с сохранённого места.',
        target: '.main-navigation a[href="/my-courses"]',
        optional: true,
      },
      {
        title: 'Drag & Drop курс',
        text: 'Конструктор курса из ваших файлов: добавляйте материалы на холст, объединяйте их в уроки и модули и проверяйте структуру перед сборкой.',
        target: '.main-navigation a[href="/drag-and-drop-course"]',
        optional: true,
      },
      {
        title: 'Создать курс',
        text: 'Чат-конструктор помогает собрать программу с ИИ. Опишите тему и цель, ответьте на уточнения и подтвердите описание перед генерацией.',
        target: '.main-navigation a[href="/creator"]',
        optional: true,
      },
      {
        title: 'Быстрый старт',
        text: 'Здесь можно повторить это знакомство и отдельно попробовать учебный чат, дерево курса, теорию, вопросы и практику. Выбирайте нужный урок в любое время.',
        target: '.main-navigation a[href="/quick-start"]',
      },
    ],
  },
  learningTraining: {
    label: 'Обучение',
    steps: [
      {
        title: 'Содержание и теория',
        text: 'В дереве выделен текущий урок. Под ним находятся теория, вопросы и практика. Текст теории можно пролистать целиком. Дальше попробуем свернуть дерево курса.',
        target: '.training-lesson .course-nav-tree',
      },
      {
        title: 'Сверните дерево курса',
        text: 'Дерево можно свернуть стрелкой. Книжка рядом с уроком позволяет снова открыть содержание. Попробуйте свернуть дерево, затем продолжим с вопросами.',
        target: '.training-lesson .course-contents-toggle',
      },
      {
        title: 'ИИ-ментор всегда рядом',
        text: 'Если что-то непонятно, нажмите «Спросить ИИ». Ментор поможет объяснить сложное проще, привести пример или разобраться с практикой. Можно читать урок и общаться с помощником одновременно.',
        target: '.training-lesson [data-help="lesson-mentor"]',
      },
      {
        title: 'Проверьте понимание',
        text: 'Выберите вариант и нажмите «Проверить ответ». Кнопка «К теории» возвращает к материалу. «Далее» в подсказке откроет практику.',
        target: '.training-lesson-content',
      },
      {
        title: 'Попробуйте практику',
        text: 'В учебном примере решение можно менять прямо в поле. Проверьте его кнопкой под кодом или нажмите «Далее», чтобы проверить готовый пример.',
        target: '.training-lesson textarea',
      },
      {
        title: 'Знакомство завершено',
        text: 'Теперь вы знаете, как переходить между частями урока и пользоваться деревом. Пробный курс останется в «Моих курсах» в этом браузере.',
        target: '.training-lesson [data-training-finish]',
      },
    ],
  },
  creatorTraining: {
    label: 'Чат',
    steps: [
      {
        title: 'Здесь начинается создание курса',
        text: 'Начните с названия курса в поле внизу. «Отправить» отправляет ответ. В знакомстве используются готовые ответы. Можно написать свой ответ или нажать «Далее», чтобы ответить примером.',
        target: '.creator-training .ai-chat-input',
      },
      {
        title: 'Определите цель',
        text: 'Укажите, чему должен научиться студент. Ответьте в чате или нажмите «Далее» — учебный пример заполнит этот шаг за вас.',
        target: '.creator-training .ai-chat-input',
      },
      {
        title: 'Выберите длительность',
        text: 'Задайте срок обучения. Варианты над полем ввода помогают быстро заполнить ответ; затем нажмите «Отправить».',
        target: '.creator-training .ai-chat-input',
      },
      {
        title: 'Уточните формат',
        text: 'Выберите сочетание теории и практики. В рабочем чате эти ответы помогают ИИ подобрать структуру программы.',
        target: '.creator-training .ai-chat-input',
      },
      {
        title: 'Укажите уровень',
        text: 'Подберите сложность под будущую аудиторию. Выберите вариант над полем или введите свой ответ.',
        target: '.creator-training .ai-chat-input',
      },
      {
        title: 'Опишите аудиторию',
        text: 'Расскажите, для кого курс и где слушатели применят новые знания. В знакомстве можно использовать готовый пример.',
        target: '.creator-training .ai-chat-input',
      },
      {
        title: 'Добавьте материалы',
        text: 'Укажите, какие материалы нужно учесть. В рабочем чате кнопка «+» прикрепляет документы. Для знакомства достаточно текстового ответа.',
        target: '.creator-training .ai-chat-input',
      },
      {
        title: 'Подтвердите запуск',
        text: 'Перед запуском проверьте описание и цель курса. «Проверить и запустить» открывает подтверждение. В знакомстве используется готовый пример без обращения к ИИ.',
        target: '.creator-training [data-training-next]',
      },
      {
        title: 'Пробный курс готов',
        text: 'Откройте готовый пример: попробуйте дерево курса, теорию, проверочные вопросы и практику. Рабочая переписка остаётся в обычном разделе создания курса.',
        target: '.creator-training [data-training-next]',
      },
    ],
  },
  courses: {
    label: 'Курсы',
    steps: [
      {
        title: 'Выберите готовый курс',
        text: 'Здесь собраны готовые программы. Откройте карточку, чтобы узнать о курсе и перейти к обучению.',
        target: '.courses-catalog-grid',
      },
      {
        title: 'Найдите нужную программу',
        text: 'Ищите по названию и выбирайте уровень и тему. Фильтры помогают сузить список курсов.',
        target: '.courses-tab input[type="search"], .courses-tab input',
      },
    ],
  },
  creator: {
    label: 'Создание курса',
    steps: [
      {
        title: 'Чат-конструктор',
        text: 'Начните с темы и цели курса. Помощник по очереди уточнит длительность, формат, уровень, аудиторию и материалы.',
        target: '.creator-chat-main',
      },
      {
        title: 'Опишите ваш курс',
        text: 'Введите ответ здесь. Enter отправляет сообщение, Shift + Enter добавляет строку. Отправка запускает настоящий диалог с ИИ.',
        target: '.creator-chat-main textarea',
      },
      {
        title: 'Прикрепите материалы',
        text: 'Кнопка «+» добавляет документы. Перед генерацией помощник покажет описание и цели: проверьте их и подтвердите запуск. Подсказки сами ничего не отправляют.',
        target: '.creator-chat-main [aria-label="Прикрепить файлы"]',
      },
      {
        title: 'Вернитесь к результату',
        text: 'Готовый курс появится в «Моих курсах». Генерацию можно оставить работать и вернуться позже.',
        target: '.main-navigation a[href="/my-courses"]',
      },
    ],
  },
  learning: {
    label: 'Обучение',
    steps: [
      {
        title: 'Содержание курса',
        text: 'Выберите курс, откройте модуль и урок. Внутри урока появится дерево: здесь модули, текущий урок, следующие уроки и ваш прогресс.',
        target: '.course-nav-tree',
        waitForTarget: true,
      },
      {
        title: 'Теория урока',
        text: 'Здесь находится материал урока. Нажмите «Теория» под текущим уроком, чтобы вернуться к чтению.',
        target: '.course-nav-lesson-part[aria-label="Теория"]',
        action: '.course-nav-lesson-part[aria-label="Теория"]',
      },
      {
        title: 'Проверочные вопросы',
        text: 'Вопросы проверяют понимание теории. Этот пункт переключает содержимое того же урока.',
        target: '.course-nav-lesson-part[aria-label="Проверочные вопросы"]',
        action: '.course-nav-lesson-part[aria-label="Проверочные вопросы"]',
      },
      {
        title: 'Практика',
        text: 'Практика помогает применить прочитанное. После неё следующий урок можно открыть компактной строкой ниже в дереве.',
        target: '.course-nav-lesson-part[aria-label="Практика"]',
        action: '.course-nav-lesson-part[aria-label="Практика"]',
      },
      {
        title: 'Настройте рабочее пространство',
        text: 'Дерево сворачивается этой стрелкой. Книжка рядом с уроком позволяет снова открыть его и перейти к другому материалу.',
        target: '.course-nav-tree [aria-label="Свернуть содержание"]',
        action: '.course-nav-lesson-part[aria-label="Теория"]',
      },
      {
        title: 'ИИ-ментор всегда рядом',
        text: 'Нажмите «Спросить ИИ», если нужно объяснить сложное место, увидеть пример или получить помощь с практикой. Помощник доступен в любой части урока; чат можно держать открытым рядом с материалом.',
        target: '.lesson-chat-open-button, .lesson-page-ai-chat',
      },
    ],
  },
  dnd: {
    label: 'Drag & Drop',
    steps: [
      {
        title: 'Подготовьте курс',
        text: 'Укажите название, описание и сложность. После перехода на холст обучение продолжится рядом с палитрой.',
        target: '.dnd-start-form, .dnd-topbar',
        waitForTarget: true,
      },
      {
        title: 'Загрузите материалы',
        text: 'Перейдите на холст кнопкой в форме. Загрузите документы через палитру или перетащите их на холст.',
        target: '.dnd-palette',
        reveal: [
          '.dnd-topbar [data-help="canvas-mode"][aria-pressed="false"]',
          '.dnd-topbar-palette[aria-pressed="false"]',
        ],
        waitForTarget: true,
      },
      {
        title: 'Соберите первый урок',
        text: 'Перетащите материалы в зону нового урока. Уроки объединяются в модули. Клик по карточке открывает её настройки в инспекторе.',
        target: '.react-flow',
      },
      {
        title: 'Проверьте структуру',
        text: 'Откройте настройки узла, проверьте названия и связи. Кнопка «Проверить» помогает найти незавершённые части перед сборкой курса.',
        target: '.dnd-inspector',
        reveal: [
          '.dnd-topbar [aria-label="Настройки курса"]',
          '.dnd-mobile-menu-trigger[aria-expanded="false"]',
          '[role="menu"] button',
        ],
      },
    ],
  },
  myCourses: {
    label: 'Мои курсы',
    steps: [
      {
        title: 'Ваши курсы',
        text: 'Здесь находятся созданные курсы и программы, к которым вы присоединились. Откройте карточку, чтобы продолжить.',
        target: '.courses-tab',
      },
      {
        title: 'Быстрый поиск',
        text: 'Ищите курс по названию и фильтруйте список по уровню и теме.',
        target: '.courses-tab input',
      },
    ],
  },
  profile: {
    label: 'Профиль',
    steps: [
      {
        title: 'Ваш профиль',
        text: 'Здесь находятся данные аккаунта. Нажмите «Редактировать профиль», чтобы изменить никнейм, ФИО или аватар.',
        target: '.profile-edit-card [data-help="profile-edit"]',
        anchor: '.profile-sidebar',
      },
      {
        title: 'Редактирование профиля',
        text: 'Откройте редактирование кнопкой в карточке. «Сохранить» применяет данные, «Отмена» возвращает просмотр. Подсказка не меняет ваши данные.',
        target: '.profile-edit-card form',
        action: '.profile-edit-card [data-help="profile-edit"]',
        anchor: '.profile-sidebar',
        waitForTarget: true,
      },
    ],
  },
} satisfies Record<string, HelpGuide>;
export type HelpGuideId = keyof typeof helpGuides;

export function guideForPath(path: string): HelpGuideId | null {
  if (path === '/') return 'home';
  if (/^\/course\/[^/]+\/lesson\/[^/]+\/?$/.test(path)) return 'learning';
  if (path === '/courses') return 'courses';
  if (path === '/creator') return 'creator';
  if (path === '/drag-and-drop-course') return 'dnd';
  if (path === '/my-courses') return 'myCourses';
  if (path === '/profile') return 'profile';
  return null;
}
