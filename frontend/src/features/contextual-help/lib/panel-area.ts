/** Подсказка занимает свободную часть экрана справа от главного меню. */
export function getHelpPanelArea(
  viewportLeft: number,
  viewportWidth: number,
  navigationRight: number | undefined,
  preferredWidth: number,
) {
  const right = viewportLeft + viewportWidth - 16;
  const left = Math.max(
    viewportLeft + 16,
    Math.min(
      navigationRight === undefined ? viewportLeft + 16 : navigationRight + 12,
      right - 1,
    ),
  );
  return { left, width: Math.max(1, Math.min(preferredWidth, right - left)) };
}
