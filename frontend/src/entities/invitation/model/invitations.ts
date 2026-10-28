// Общие помощники для приглашений: валидация email/ролей и разбор ошибок принятия.
import { getErrorMessage } from "@/shared/lib/errors";
import type { InvitationType, Role } from "./types";

export interface RoleDescription {
  id: string | undefined;
  label: string;
  hint: string;
}

export interface AcceptErrorDescription {
  kind: "invalid" | "wrong-account" | "member" | "retry";
  title: string;
  text: string;
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Понятные названия системных ролей; остальные показываем как назвали на бэке.
const USER_ROLE_TEXT = {
  label: "Пользователь",
  hint: "Проходит курсы, видит свой прогресс и профиль.",
};

const ROLE_TEXT: Record<string, { label: string; hint: string }> = {
  // На бэке базовая роль переименована user → default_role, поддерживаем обе.
  default_role: USER_ROLE_TEXT,
  user: USER_ROLE_TEXT,
  admin: {
    label: "Администратор",
    hint: "Полный доступ: курсы, организации, участники и настройки.",
  },
};

export function describeRole(
  role: Partial<Role> | null | undefined,
): RoleDescription {
  const known = ROLE_TEXT[String(role?.code || "").toLowerCase()];
  return {
    id: role?.id,
    label: known?.label || role?.name || role?.code || "Роль",
    hint: known?.hint || role?.description || "",
  };
}

export const INVITATION_TYPES: Record<
  InvitationType,
  { label: string; title: string; memberText: string }
> = {
  course: {
    label: "Приглашение на курс",
    title: "Приглашение на курс",
    memberText: "участник курса",
  },
  organization: {
    label: "Приглашение в организацию",
    title: "Приглашение в организацию",
    memberText: "участник организации",
  },
};

// Бэкенд отвечает одним 404 на истёкшее, отозванное и уже использованное приглашение.
export function describeAcceptError(
  rawError: unknown,
  type: InvitationType | string,
): AcceptErrorDescription {
  const isCourse = type === "course";
  const error = rawError as { status?: number } | null | undefined;

  if (error?.status === 404) {
    return {
      kind: "invalid",
      title: "Приглашение недействительно",
      text: "Срок его действия истёк, его отозвали или по ссылке уже приняли приглашение. Попросите отправить новое.",
    };
  }
  if (error?.status === 403) {
    return {
      kind: "wrong-account",
      title: "Приглашение отправлено на другой email",
      text: "Войдите под тем аккаунтом, на чей email пришло письмо с приглашением.",
    };
  }
  if (error?.status === 409) {
    return {
      kind: "member",
      title: isCourse
        ? "Вы уже участник курса"
        : "Вы уже состоите в организации",
      text: isCourse
        ? "Курс уже есть в вашем списке — откройте его в личном кабинете."
        : "Повторно принимать приглашение не нужно.",
    };
  }
  return {
    kind: "retry",
    title: "Не удалось принять приглашение",
    text: getErrorMessage(rawError, "Попробуйте ещё раз чуть позже.") ?? "",
  };
}
