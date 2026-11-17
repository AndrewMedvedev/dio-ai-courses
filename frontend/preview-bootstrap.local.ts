const userId = '10000000-0000-4000-8000-000000000001';
const organizationId = '10000000-0000-4000-8000-000000000002';
const membershipId = '10000000-0000-4000-8000-000000000003';
const courseId = '20000000-0000-4000-8000-000000000001';
const moduleId = '20000000-0000-4000-8000-000000000002';
const lessonId = '20000000-0000-4000-8000-000000000003';
const user = { id: userId, email: 'admin@local.test', username: 'admin', full_name: 'admin' };
const permissions = ['course:read', 'course:course_read', 'course:create', 'course:update', 'course:delete', 'organization:read', 'organization:organization_read', 'invitation:read', 'ai_model:read'];
const tokens = { accessToken: 'local-preview-not-a-real-token', refreshToken: null, expiresAt: Math.floor(Date.now() / 1000) + 86400, membershipId, organizationId };
localStorage.setItem('aicolab_session', JSON.stringify(tokens));
localStorage.setItem('aicolab-session-cache', JSON.stringify({ version: 1, state: { user, membershipId } }));

const theory = [{ content_type: 'text', ai_generated: false, md_content: '## Переменные и типы данных\n\nПеременная связывает имя со значением.\n\n```python\nname = "Анна"\nage = 24\nprint(name, age)\n```\n\n### Попробуйте сами\n\nОткройте вкладку «Практика» и подготовьте задание. После ответа обновите страницу: ваше решение и результат должны остаться.\n\nЧат «Спросить ИИ» здесь тоже отвечает локально, без модели.' }];
const lesson = { id: lessonId, module_id: moduleId, title: 'Переменные и типы данных', description: 'Знакомимся с Python и проверяем сохранение состояния.', order: 1, estimated_time_minutes: 10, content_blocks: theory };
const module = { id: moduleId, course_id: courseId, title: 'Знакомство с Python', description: 'Первый модуль пробного курса', order: 1, lessons: [lesson] };
const course = { id: courseId, title: 'Основы Python', description: 'Локальный пробный курс. Все ответы замоканы, реальных запросов к ИИ нет.', difficulty: 'beginner', status: 'published', tags: ['python', 'backend'], modules: [module], created_by: userId, creator_id: userId };
const page = (items: unknown[]) => ({ items, page: 1, size: 20, total: items.length, total_pages: 1, pages: 1 });
const originalFetch = window.fetch.bind(window);
window.fetch = async (input, options = {}) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.origin);
  if (!url.pathname.startsWith('/api/')) {
    if (url.origin === location.origin) return originalFetch(input, options);
    throw new Error('Local preview: external fetch is blocked');
  }
  if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const path = url.pathname.replace('/api/v1', '');
  const method = options.method || (input instanceof Request ? input.method : 'GET');
  const json = (value: unknown, status = 200) => Response.json(value, { status });
  const body = typeof options.body === 'string' ? JSON.parse(options.body) as Record<string, unknown> : {};
  if (path === '/auth/identity') return json({ id: userId, type: 'user', organization_id: organizationId, membership_id: membershipId, permissions });
  if (path === '/users/me') return json({ ...user, ...body });
  if (path === '/auth/login') return json({ authentication_token: 'local-only', memberships: [{ id: membershipId, organization_id: organizationId, organization_name: 'Локальная организация' }] });
  if (path === '/auth/token' || path === '/auth/token/refresh') return json({ access_token: tokens.accessToken, expires_in: 86400, membership_id: membershipId, organization_id: organizationId });
  if (path === '/auth/logout') return json({ success: true });
  if (path === '/courses/search' || path === '/courses/my-courses') return json(page([course]));
  if (path === `/courses/${courseId}`) return json(course);
  if (path === `/modules/${moduleId}`) return json(module);
  if (path === `/lessons/${lessonId}/theory`) return json(theory);
  if (path === `/lessons/${lessonId}`) return json(lesson);
  if (path.includes('/permissions')) return json(permissions);
  if (path.startsWith('/members')) return json(page([{ id: membershipId, course_id: courseId, user_id: userId, role: 'student' }]));
  if (path.startsWith('/agent/check/')) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    return json({ score: 95, ai_feedback: 'Хорошая работа! Решение принято в локальном примере. Это готовый мок-ответ, модель не вызывалась.' });
  }
  if (path.startsWith('/agent/practices/')) return json({ practice_id: `local-practice-${Date.now()}`, practice: { title: 'Создайте две переменные', description: 'Создайте переменные name и age. Выведите их через print().', allowed_extensions: ['.py', '.txt'], evaluation_criteria: ['Переменные созданы', 'Значения выведены'], passing_score: 61 } });
  if (path.startsWith('/agent/tests/')) return json({ practice_id: `local-test-${Date.now()}`, practice: { test_type: 'multiple_choice', questions: [{ id: 'q1', text: 'Какой тип у значения 24?', options: ['int', 'str', 'bool'], points: 100 }] } });
  if (path === '/agent/mentor') {
    await new Promise((resolve) => setTimeout(resolve, 600));
    return json({ chat_id: body.chat_id || 'local-mentor-chat', content: 'Переменная хранит ссылку на значение. Например: `age = 24`. Функция `print(age)` выведет 24. Это локальный ответ: можешь обновить страницу и проверить, что переписка сохранилась.' });
  }
  if (path === '/agent/editor') return json({ chat_id: body.chat_id || 'local-editor-chat', content: JSON.stringify({ content_type: 'text', md_content: '## Предложенная правка\n\nЭто локальный пример правки ИИ. Обнови страницу: предложение останется, его можно применить или отклонить.' }) });
  if (path.startsWith('/agent/')) return json({ chat_id: body.chat_id || 'local-interview-chat', content: 'Принято! Опиши следующую цель обучения. Это учебный диалог без обращения к ИИ.' });
  if (path.startsWith('/progress/')) {
    const key = `local-preview-progress:${path}`;
    const record = JSON.parse(localStorage.getItem(key) || 'null') || { id: crypto.randomUUID(), course_id: courseId, module_id: moduleId, lesson_id: lessonId, progress_percent: 0 };
    const updated = { ...record, ...body };
    if (method !== 'GET') localStorage.setItem(key, JSON.stringify(updated));
    return json(updated);
  }
  if (path.startsWith('/theory-sessions/')) return json({ id: '30000000-0000-4000-8000-000000000001', lesson_id: lessonId, ...body });
  if (path === '/feedbacks' && method === 'POST') return json({ id: crypto.randomUUID(), ...body }, 201);
  if (/^\/(organizations|invitations|ai-models)/.test(path)) return json(page([]));
  return json({ detail: `В локальном просмотре не замокано: ${method} ${path}` }, 404);
};
console.info('Local preview: admin session, mocked API; backend and LLM calls are blocked.');
