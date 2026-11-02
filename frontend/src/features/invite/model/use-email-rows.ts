// Список адресов для приглашения: ввод нескольких email, проверка формата,
// подсказка «есть в системе / нет в системе» и последовательная отправка.
// Общий для окон «Пригласить на курс», «в организацию» и «в систему».
import { useCallback, useRef, useState } from "react";
import { EMAIL_RE } from "@/entities/invitation";
import { findUserByEmail, type User } from "@/entities/user";

export type EmailRowStatus =
  | "checking"
  | "found"
  | "new"
  | "unknown"
  | "sending"
  | "error";

export interface EmailRow {
  email: string;
  status: EmailRowStatus;
  user: User | null;
  message: string;
}

export type EmailRows = ReturnType<typeof useEmailRows>;

export const MAX_EMAILS = 20;

export function useEmailRows() {
  const lookupCache = useRef(new Map<string, User | null>());
  const [draft, setDraft] = useState("");
  const [draftError, setDraftError] = useState("");
  const [rows, setRows] = useState<EmailRow[]>([]);

  const updateRow = useCallback(
    (
      email: string,
      patch: Partial<EmailRow>,
      onlyIfStatus: EmailRowStatus | null = null,
    ) => {
      setRows((current) =>
        current.map((row) =>
          row.email === email && (!onlyIfStatus || row.status === onlyIfStatus)
            ? { ...row, ...patch }
            : row,
        ),
      );
    },
    [],
  );

  // Пользователь проверяется точечным запросом по email только когда адрес введён целиком.
  const checkEmail = useCallback(
    async (email: string) => {
      if (lookupCache.current.has(email)) {
        const user = lookupCache.current.get(email) ?? null;
        updateRow(email, { status: user ? "found" : "new", user }, "checking");
        return;
      }
      try {
        const user = await findUserByEmail(email);
        lookupCache.current.set(email, user);
        updateRow(email, { status: user ? "found" : "new", user }, "checking");
      } catch {
        // Проверка — только подсказка: приглашение всё равно можно отправить.
        updateRow(email, { status: "unknown", user: null }, "checking");
      }
    },
    [updateRow],
  );

  // Возвращает добавленные адреса или false, если во вводе есть некорректные.
  const addEmails = useCallback(
    (raw: unknown): string[] | false => {
      const parts = String(raw || "")
        .split(/[\s,;]+/)
        .map((part) => part.trim().toLowerCase())
        .filter(Boolean);
      if (!parts.length) return [];

      const invalid = parts.filter((part) => !EMAIL_RE.test(part));
      const valid = parts.filter((part) => EMAIL_RE.test(part));
      const existing = new Set(rows.map((row) => row.email));
      const fresh = [...new Set(valid)].filter((email) => !existing.has(email));
      const room = Math.max(0, MAX_EMAILS - rows.length);
      const accepted = fresh.slice(0, room);

      if (accepted.length) {
        setRows((current) => [
          ...current,
          ...accepted.map((email) => ({
            email,
            status: "checking" as const,
            user: null,
            message: "",
          })),
        ]);
        accepted.forEach(checkEmail);
      }

      if (invalid.length) {
        setDraftError(`Некорректный email: ${invalid.join(", ")}`);
        setDraft(invalid.join(", "));
        return false;
      }
      if (fresh.length > room) {
        setDraftError(`За один раз можно пригласить до ${MAX_EMAILS} человек.`);
      } else {
        setDraftError("");
      }
      setDraft("");
      return accepted;
    },
    [checkEmail, rows],
  );

  const removeRow = useCallback((email: string) => {
    setRows((current) => current.filter((row) => row.email !== email));
  }, []);

  const reset = useCallback(() => {
    setRows([]);
    setDraft("");
    setDraftError("");
  }, []);

  // Отправляет приглашения по очереди. Успешные адреса убираются из списка,
  // у неудачных остаётся текст ошибки. null — нечего отправлять / ошибка ввода.
  const sendAll = useCallback(
    async (
      sendOne: (email: string) => Promise<unknown>,
      errorMessage: (error: unknown) => string,
    ): Promise<{ sent: string[]; total: number } | null> => {
      let added: string[] = [];
      if (draft.trim()) {
        const result = addEmails(draft);
        if (result === false) return null;
        added = result;
      }
      const targets = [...rows.map((row) => row.email), ...added];
      if (!targets.length) {
        setDraftError("Добавьте хотя бы один email.");
        return null;
      }

      const sent: string[] = [];
      for (const email of targets) {
        updateRow(email, { status: "sending", message: "" });
        try {
          await sendOne(email);
          sent.push(email);
        } catch (error) {
          updateRow(email, { status: "error", message: errorMessage(error) });
        }
      }
      setRows((current) => current.filter((row) => !sent.includes(row.email)));
      return { sent, total: targets.length };
    },
    [addEmails, draft, rows, updateRow],
  );

  return {
    draft,
    setDraft,
    draftError,
    setDraftError,
    rows,
    addEmails,
    removeRow,
    reset,
    sendAll,
  };
}
