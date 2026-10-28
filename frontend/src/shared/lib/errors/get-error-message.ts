interface ErrorWithMessage {
  userMessage?: string;
  message?: string;
}

export function getErrorMessage(
  error: unknown,
  fallbackMessage?: string,
): string | undefined {
  const source = error as ErrorWithMessage | null | undefined;
  return source?.userMessage || source?.message || fallbackMessage;
}
