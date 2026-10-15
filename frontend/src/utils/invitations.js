// Общие помощники для приглашений: валидация email/ролей и разбор ошибок принятия.
import { getErrorMessage } from "./errors";

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Понятные названия системных ролей; остальные показываем как назвали на бэке.
const ROLE_TEXT = {
  user: {
    label: "Пользователь",
    hint: "Проходит курсы, видит свой прогресс и профиль.",
  },
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

// Бэкенд сейчас отвечает одним 404 на истёкшее, отозванное и использованное
// приглашение. Если в ответе появится уточнение — покажем точный вариант.
function invalidReason(error) {
  const text = `${error?.code || ""} ${error?.message || ""}`.toLowerCase();
  if (/expired|истек|истёк/.test(text)) return "expired";
  if (/revoked|отозван/.test(text)) return "revoked";
  if (/used|использован/.test(text)) return "used";
  return "invalid";
}

export function describeAcceptError(error, type) {
  const isCourse = type === "course";
  if (error?.status === 404) {
    const reason = invalidReason(error);
    if (reason === "expired") {
      return {
        kind: "invalid",
        title: "Срок действия приглашения истёк",
        text: "Попросите отправить приглашение ещё раз — новая ссылка придёт на почту.",
      };
    }
    if (reason === "revoked") {
      return {
        kind: "invalid",
        title: "Приглашение отозвано",
        text: "Отправитель отменил это приглашение. Если это ошибка — попросите прислать новое.",
      };
    }
    if (reason === "used") {
      return {
        kind: "invalid",
        title: "Приглашение уже использовано",
        text: "По этой ссылке уже приняли приглашение. Повторно её использовать нельзя.",
      };
    }
    return {
      kind: "invalid",
      title: "Приглашение недействительно",
      text: "Срок его действия истёк, его отозвали или по ссылке уже приняли приглашение. Попросите отправить новое.",
    };
  }
  if (error?.status === 409) {
    return {
      kind: "member",
      title: isCourse ? "Вы уже участник курса" : "Вы уже состоите в организации",
      text: isCourse
        ? "Курс уже есть в вашем списке — откройте его в личном кабинете."
        : "Повторно принимать приглашение не нужно.",
    };
  }
  if (error?.status === 403) {
    return {
      kind: "wrong-account",
      title: "Приглашение отправлено на другой email",
      text: "Войдите под тем аккаунтом, на чей email пришло письмо с приглашением.",
    };
  }
  return {
    kind: "retry",
    title: "Не удалось принять приглашение",
    text: getErrorMessage(error, "Попробуйте ещё раз чуть позже."),
  };
}
