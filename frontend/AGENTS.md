# AI Course Lab Frontend

Веб-интерфейс платформы генерации и прохождения курсов: каталог, создание курса с ИИ, редактор модулей и уроков, Drag & Drop-конструктор, обучение и метрики прохождения, организации и приглашения.

## Основной стэк

 - `React 18` / `TypeScript`
 - `Vite 5`
 - `Tailwind CSS 4` — стили компонентов, утилитами с префиксом `tw:` прямо в `className` (см. ниже)
 - `CSS` — только переменные темы и стили тегов (`src/app/styles/base.css`) и подключение стилей xyflow
 - `Zustand` — состояние (сессия, права, тема, черновики редактора, метрики)
 - `React Router 7`
 - `react-markdown` / `remark-gfm` / `mermaid` — контент уроков
 - `@xyflow/react` — Drag & Drop-конструктор курса

## Команды

```bash
npm install
npm run dev        # http://localhost:5173, /api проксируется на http://127.0.0.1:8000
npm run build
npm run typecheck  # проверка типов TypeScript
```

## Архитектура

Разделяем приложение не по UI-компонентам, а по владению состоянием.

FSD-структура:

```plain
src/
├── app/
├── pages/
├── widgets/
├── features/
├── entities/
└── shared/
```

Правило зависимостей:

```mermaid
flowchart TD
    app --> pages
    pages --> widgets
    widgets --> features
    features --> entities
    entities --> shared
```

Слой может импортировать только из слоёв ниже себя. Импорт «вверх» или между соседними slices одного слоя запрещён.

где:
 - `app` — точка входа, роутер, провайдеры, глобальные стили, применение темы (никакой бизнес-логики);
 - `pages` — страницы (собирают интерфейс из виджетов и фич): каталог, курс, модуль, урок, практика, конструктор, профиль, организации, модели, вход;
 - `widgets` — крупные самостоятельные блоки: шапка, футер, хлебные крошки, урок с ИИ-чатом, сводка метрик;
 - `features` — действия пользователя с бизнес-ценностью: принятие приглашения, приглашение в организацию и в курс, создание курса и генерация модуля/урока через ИИ, редактирование контента урока, ИИ-наставник, тест и практика, прогресс;
 - `entities` — бизнес-сущности: курс, модуль, урок, контент-блок, пользователь/сессия, организация, приглашение, роль и права, прогресс, ИИ-модель;
 - `shared` — код без привязки к бизнесу: UI-кит (модалки, плавающее окно, тосты), вызов бэкенда, утилиты, хуки, конфиг, типы.

Текущая структура:

```plain
src/
├── app/
│   ├── router/                  # охрана маршрутов (ProtectedRoute)
│   ├── styles/                  # глобальные стили, index.css — точка входа
│   ├── App.tsx                  # маршруты и общее состояние страниц
│   ├── theme-bootstrap.ts
│   └── main.tsx
│
├── pages/
│   ├── home/
│   ├── catalog/
│   ├── course-edit/             # курс в режиме автора: модули, участники, публикация
│   ├── course-view/             # просмотр курса учеником и метрики для автора
│   ├── module-edit/
│   ├── lesson-edit/
│   ├── practice/
│   ├── creator/
│   ├── dnd-course/              # Drag & Drop-конструктор курса и его предпросмотр
│   ├── profile/
│   ├── organizations/
│   ├── models/
│   ├── auth/
│   └── invitation-accept/
│
├── widgets/
│   ├── header/
│   ├── footer/
│   ├── breadcrumbs/
│   ├── lesson-chat-workspace/   # урок + выдвижной ИИ-чат
│   └── course-metrics/          # сводка по курсу и метрики урока
│
├── features/
│   ├── accept-invitation/
│   ├── invite/                  # приглашения в организацию и на курс
│   ├── agent-interview/         # ИИ-интервьюер модуля и урока
│   ├── lesson-mentor-chat/      # ИИ-наставник по уроку
│   ├── lesson-assessment/       # тест и практика урока
│   ├── edit-lesson-content/     # редактор контент-блоков урока
│   ├── create-course-chat/      # создание курса в чате с ИИ
│   ├── edit-course-draft/
│   ├── track-generation/
│   ├── track-theory-time/
│   ├── course-progress/
│   └── upload-document/
│
├── entities/
│   ├── session/                 # сессия, текущий пользователь, права
│   ├── course/                  # курс, модули, уроки, контент-блоки
│   ├── progress/
│   ├── agent-chat/
│   ├── generation-job/
│   ├── organization/
│   ├── invitation/
│   ├── user/
│   └── ai-model/
│
└── shared/
    ├── api/
    ├── lib/
    └── ui/
```

Внутри slice код раскладываем по сегментам: `ui/` (компоненты), `model/` (сторы, типы, хуки), `lib/` (чистые функции), `api/` (запросы), `config/` (константы). Наружу slice отдаёт только то, что экспортирует его `index.ts`. Экспорты — только именованные.

Конструктор `pages/dnd-course` пока живёт целиком внутри страницы: его стор и холст больше нигде не используются. Если часть понадобится другой странице, её выносим в `widgets` или `features`.

Внутри slice используем только относительные импорты. Между слоями — через алиас `@/` (`@/shared/ui`, `@/entities/course`) и только через публичный `index.ts` slice.

Если одной сущности нужен код другой сущности того же слоя, она берёт его только через явный публичный API `@x`: `entities/<сущность>/@x/<для какой сущности>.ts` (например, `@/entities/course/@x/agent-chat`). Такие связи держим минимальными.

## Работа с бэкендом

Не нужно городить отдельный api-слой: в `shared/api` лежит общий вызов бэкенда (`requestJson` — токен, обновление сессии, ошибки), его вызывают сторы и фичи.

```plain
                    React
                      │
                widgets/features
                      │
                   stores
                      │
                 requestJson
                      │
                    REST
                      │
                   Backend
```

Не создавать api-прослойку только потому, что запрос идёт на бэкенд. Отдельную функцию или adapter делаем, только когда:
- endpoint сложный;
- нужен mapper (например, курс с бэкенда → модель редактора);
- несколько HTTP-вызовов;
- хочется скрыть детали транспорта;
- у операции есть важное предметное имя;
- это опрос статуса генерации или streaming.

## Стили

- **Интерфейс при рефакторинге не меняется**: цвета, отступы, расположение остаются прежними. После переноса сверяем скриншоты до и после.
- Стили пишем утилитами Tailwind в `className`: `tw:flex tw:gap-[12px] tw:text-(--muted)`. Tailwind подключён без preflight и с префиксом `tw:`, поэтому не конфликтует с классами разметки (`.container`, `.hidden`, `.section`).
- Семантические классы (`course-card`, `btn`, `is-active`) остаются в разметке как имена элементов и состояний: на них опираются тесты, JS (`closest`, `classList`) и варианты утилит. Своих стилей в CSS у них больше нет, новые правила для них в CSS не добавляем.
- Условия пишем вариантами:
  - состояния элемента — `tw:hover:`, `tw:focus-visible:`, `tw:disabled:`, класс-состояние — `tw:[&.is-active]:`;
  - тёмная тема — `tw:dark:` (атрибут `data-theme="dark"` на `<html>` и `.page`);
  - ширина экрана — `tw:max-760:`, `tw:min-1180:` и т. д. Это точные аналоги прежних `@media (max-width: 760px)`, список в `app/styles/tailwind.css`. Встроенные `max-[760px]` не используем: они не включают границу;
  - контекст — на самом элементе `tw:[.parent_&]:`, а для общих классов (`.btn`) — на родителе `tw:[&_.btn]:`;
  - псевдоэлементы — `tw:[&::before]:`, `tw:[&::after]:`: встроенные `before:`/`after:` сами добавляют `content`.
- Значения берём из CSS-переменных темы (`tw:text-(--text)`, `tw:bg-(--surface)`, `tw:border-(--line)`), а не хардкодим.
- Слои: `theme → base → legacy → utilities` (объявлены в `app/styles/tailwind.css`). Утилита всегда сильнее CSS из `base` и `legacy`, независимо от специфичности.
  - `base` (`app/styles/base.css`) — переменные темы (светлая и тёмная), `box-sizing`, `html`/`body`, заголовки;
  - `legacy` — только стили самой xyflow (`pages/dnd-course/ui/xyflow.css`);
  - анимации — в `@theme inline` в `tailwind.css`, используются как `tw:animate-<имя>`.
- Разметку, которую рисуют библиотеки (markdown, узлы xyflow, SVG mermaid), стилизуем с нашего родителя: `tw:[&_h2]:mt-[1.2em]`, `tw:[&_.react-flow__pane]:cursor-grab`, `tw:dark:[&_.node_rect]:fill-[#384554]!`.
- Состояния на `<body>` ставим вместе с утилитами: `document.body.classList.add("is-dnd-fullscreen", "tw:overflow-hidden")`.
- Новые CSS-файлы не заводим.
- Если для элемента не хватает утилит (сложный селектор, `:has()`), используем произвольный вариант `tw:[…]:` или произвольное свойство `tw:[prop:value]`.

## TypeScript

- Новый код пишем только на TypeScript (`.ts` / `.tsx`).
- Весь `src` переведён на TypeScript, `allowJs` выключен. Новые `.js` / `.jsx` не добавляем.
- `strict` включён. `any` без комментария не используем; данные с бэкенда описываем типами в `entities/*/model`. Для слабо типизированных ответов, которые ещё не описаны, есть `RawApiRecord` из `@/shared/api`.
- Перед коммитом: `npm run typecheck` и `npm run build`.

## Локальная разработка

- `?ai-mock=1` — демо-режим ИИ без расхода модели. Локальный мок лежит в `src/services/agentMock.local.js` (в репозиторий не коммитится), подключает его `shared/lib/agent-mock` только в dev-сборке.
- Локальные правки бэкенда, docker-override и скрипты тоже не коммитятся.

## Статус переноса

- [x] TypeScript, Tailwind (без preflight, префикс `tw:`), алиас `@/`, точка входа `src/app/main.tsx`
- [x] `shared/lib`: storage, errors, dom, media
- [x] `shared/ui`: toast, app-modal, confirm-dialog, floating-window, section-top
- [x] `shared/api`: `requestJson`, `jsonRequest`, `apiFetch`, сессия и токены, `ApiError`
- [x] `shared/lib/ui-layout`: история маршрутов, «Назад», восстановление скролла, UI-настройки страниц
- [x] `shared/ui`: mermaid-diagram, syntax-highlighted-code
- [x] `entities/session`: сессия, вход, текущий пользователь, права (`useAppPermissions`, `PermissionGate`); охрана маршрутов — `app/router/ProtectedRoute`
- [x] `entities/course`: запросы курса, модулей и уроков, мапперы бэкенд ↔ интерфейс, контент-блоки, уровни сложности
- [x] `entities`: organization, invitation, ai-model, user, progress; в course — кеш курсов, запись на курс, состояние дерева курса, выбор по адресу, проверочные вопросы, печать конспекта
- [x] `shared/api/attachments` (загрузка файлов), `shared/lib/theme`
- [x] `entities/agent-chat` (диалоги с ИИ-агентами и их API), `entities/generation-job` (запущенные генерации)
- [x] `features`: track-generation, edit-course-draft, upload-document, lesson-assessment; `utils/api.js` разобран полностью
- [x] `features`: track-theory-time (время и прокрутка теории), course-progress (прогресс курса и «моих курсов»); `shared/lib/activity`
- [x] UI сущностей: course (карточки курса/модуля/урока, списки, дерево навигации, блоки теории), agent-chat (markdown ответа); `shared/ui/content-preview`; виджеты header, footer, breadcrumbs
- [x] UI фич: invite (приглашения в организацию и на курс), edit-course-draft (панель сохранения черновика); `shared/ui/text-diff`
- [x] UI фич: agent-interview (ИИ-интервьюер модуля и урока), lesson-mentor-chat (ИИ-наставник), lesson-assessment (тест и практика урока); виджет lesson-chat-workspace
- [x] Виджет course-metrics: сводка по курсу, метрики теории урока, стор метрик и форматирование
- [x] Страница `pages/course-view` (просмотр курса и метрики); нумерация модулей и уроков в списках по порядку, с 01
- [x] UI фич: edit-lesson-content (редактор урока), create-course-chat (создание курса в чате с ИИ), accept-invitation
- [x] Остальные страницы: home, catalog, creator, auth, invitation-accept, models, organizations, profile, course-edit, module-edit, lesson-edit, practice, dnd-course (конструктор и предпросмотр)
- [x] `App.jsx` → `app/App.tsx`, глобальные стили → `app/styles`, `allowJs` выключен
- [x] Стили компонентов переведены на утилиты Tailwind (около 3,3 тыс. селекторов перенесены в `className`, правила для несуществующих классов удалены); в CSS остались только тема и стили тегов (`base.css`), анимации переехали в `@theme`
