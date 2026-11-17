interface ErrorWithMessage {
  userMessage?: string;
  message?: string;
  isInternalError?: boolean;
}

export function getErrorMessage(
  error: unknown,
  fallbackMessage?: string,
): string | undefined {
  const source = error as ErrorWithMessage | null | undefined;
  if (source?.isInternalError && fallbackMessage) return fallbackMessage;
  if (
    [
      'Failed to fetch',
      'Load failed',
      'NetworkError when attempting to fetch resource.',
    ].includes(source?.message || '')
  )
    return 'Не удалось связаться с сервером. Проверьте соединение.';
  return source?.userMessage || source?.message || fallbackMessage;
}
