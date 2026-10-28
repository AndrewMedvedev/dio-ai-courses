import { requestJson, type ApiError } from "@/shared/api";
import type { User } from "../model/types";

// Точечный поиск по уникальному email (индекс в БД): null, если такого пользователя нет.
export async function findUserByEmail(
  email: string,
  options: RequestInit = {},
): Promise<User | null> {
  try {
    return await requestJson(
      `/users/by-email/${encodeURIComponent(email)}`,
      options,
    );
  } catch (error) {
    if ((error as ApiError | null)?.status === 404) return null;
    throw error;
  }
}

export async function fetchUserById(userId: string): Promise<User> {
  return requestJson(`/users/${encodeURIComponent(userId)}`);
}
