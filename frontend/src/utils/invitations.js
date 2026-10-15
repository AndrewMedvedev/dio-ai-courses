// Общие помощники для приглашений: валидация email/ролей и разбор ошибок принятия.
import { getErrorMessage } from "./errors";

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Понятные названия системных ролей; остальные показываем как назвали на бэке.
const USER_ROLE_TEXT = {
  label: "Пользователь",
  hint: "Проходит курсы, видит свой прогресс и профиль.",
};

const ROLE_TEXT = {
  // На бэке базовая роль переименована user → default_role, поддерживаем обе.
  default_role: USER_ROLE_TEXT,
  user: USER_ROLE_TEXT,
  admin: {
    label: "Администратор",
    hint: "Полный доступ: курсы, организации, участники и настройки.",
  },
};

export function describeRole(role) {
  const known = ROLE_TEXT[String(role?.code || "").toLowerCase()];
  return {
    id: role?.id,
    label: known?.label || role?.name || role?.code || "Роль",
    hint: known?.hint || role?.description || "",
  };
}

export const INVITATION_TYPES = {
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

// Причину бэкенд передаёт в error.code (см. ensure_invitation_acceptable на бэке).
// Отозванное приглашение удаляется, поэтому оно приходит как INVITATION_NOT_FOUND.
export function describeAcceptError(error, type) {
  const isCourse = type === "course";
  const code = error?.code || "";

  if (code === "INVITATION_EXPIRED") {
    return {
      kind: "invalid",
      title: "Срок действия приглашения истёк",
      text: "Попросите отправить приглашение ещё раз — новая ссылка придёт на почту.",
    };
  }
  if (code === "INVITATION_USED") {
    return {
      kind: "invalid",
      title: "Приглашение уже использовано",
      text: "По этой ссылке уже приняли приглашение. Повторно её использовать нельзя.",
    };
  }
  if (code === "INVITATION_NOT_FOUND" || error?.status === 404) {
    return {
      kind: "invalid",
      title: "Приглашение отозвано",
      text: "Отправитель отменил приглашение или ссылка неверная. Если это ошибка — попросите прислать новое.",
    };
  }
  if (code === "INVITATION_EMAIL_MISMATCH" || error?.status === 403) {
    return {
      kind: "wrong-account",
      title: "Приглашение отправлено на другой email",
      text: "Войдите под тем аккаунтом, на чей email пришло письмо с приглашением.",
    };
  }
  if (code === "ALREADY_EXISTS" || error?.status === 409) {
    return {
      kind: "member",
      title: isCourse ? "Вы уже участник курса" : "Вы уже состоите в организации",
      text: isCourse
        ? "Курс уже есть в вашем списке — откройте его в личном кабинете."
        : "Повторно принимать приглашение не нужно.",
    };
  }
  return {
    kind: "retry",
    title: "Не удалось принять приглашение",
    text: getErrorMessage(error, "Попробуйте ещё раз чуть позже."),
  };
}
