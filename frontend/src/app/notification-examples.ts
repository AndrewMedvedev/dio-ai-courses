import type { UserNotification } from '@/entities/notification';

const now = Date.now();

export const notificationExamples: readonly UserNotification[] = [
  {
    id: 'demo-course',
    title: 'Приглашение на курс',
    message: 'Основы работы с ИИ',
    type: 'course_invited',
    read: false,
    created_at: new Date(now).toISOString(),
    data: {},
  },
  {
    id: 'demo-organization',
    title: 'Приглашение в организацию',
    message: 'Учебная команда',
    type: 'organization_invited',
    read: false,
    created_at: new Date(now - 25 * 60_000).toISOString(),
    data: {},
  },
  {
    id: 'demo-previous',
    title: 'Приглашение на курс',
    message: 'Введение в аналитику',
    type: 'course_invited',
    read: true,
    created_at: new Date(now - 86_400_000).toISOString(),
    data: {},
  },
];
