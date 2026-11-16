export const CHAT_PANEL_MIN_WIDTH = 360;
export const CHAT_PANEL_HANDLE_WIDTH = 12;
const EDGE_GAP = 8;

/** Ручка остаётся внутри доступной области, включая браузеры со скроллбаром. */
export function getChatPanelMaxWidth(viewportWidth: number) {
  return Math.max(
    CHAT_PANEL_MIN_WIDTH,
    viewportWidth - CHAT_PANEL_HANDLE_WIDTH - EDGE_GAP,
  );
}

export function clampChatPanelWidth(value: number, viewportWidth: number) {
  return Math.round(
    Math.min(
      Math.max(value, CHAT_PANEL_MIN_WIDTH),
      getChatPanelMaxWidth(viewportWidth),
    ),
  );
}
