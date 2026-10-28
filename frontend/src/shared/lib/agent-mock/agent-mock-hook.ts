// Точка подключения локального демо-режима ИИ-агентов.
// Сам демо-режим (src/services/agentMock.local.js) не хранится в репозитории и
// подключается только в dev-сборке, если файл есть у разработчика локально.
// Без файла все функции ниже безопасно возвращают «выключено».

export type MockAgentKind = "course" | "module" | "lesson";

interface LocalAgentMock {
  isAgentMockEnabled?: () => boolean;
  mockInterviewer: (kind: MockAgentKind, payload: unknown) => Promise<unknown>;
}

const modules: Record<string, unknown> = import.meta.env.DEV
  ? import.meta.glob("/src/services/agentMock.local.js", { eager: true })
  : {};
const localMock =
  (Object.values(modules)[0] as LocalAgentMock | undefined) || null;

export function isAgentMockEnabled(): boolean {
  return Boolean(localMock?.isAgentMockEnabled?.());
}

export function mockInterviewer(
  kind: MockAgentKind,
  payload: unknown,
): Promise<unknown> {
  if (!localMock) throw new Error("Демо-режим ИИ недоступен.");
  return localMock.mockInterviewer(kind, payload);
}
