// Общие помощники страницы метрик курса: форматы времени и дат, цвета оценок.

export function formatDuration(totalSeconds) {
  const seconds = Math.max(0, Math.round(Number(totalSeconds) || 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  if (hours > 0) return minutes ? `${hours} ч ${minutes} мин` : `${hours} ч`;
  if (minutes > 0) return rest ? `${minutes} мин ${rest} с` : `${minutes} мин`;
  return `${rest} с`;
}

// Короткая подпись оси: «11 мин», «30 с».
export function formatAxisValue(seconds) {
  const value = Math.max(0, Number(seconds) || 0);
  if (value >= 3600) return `${Math.round((value / 3600) * 10) / 10} ч`;
  if (value >= 60) return `${Math.round((value / 60) * 10) / 10} мин`;
  return `${Math.round(value)} с`;
}

function toDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDateTime(value) {
  const date = toDate(value);
  if (!date) return "—";
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatShortDate(value) {
  const date = toDate(value);
  if (!date) return "—";
  return date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
}

// Значение yyyy-mm-dd для <input type="date"> по местному времени.
export function toDateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getInitials(name) {
  return (
    String(name || "")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "С"
  );
}

// Цвет по шкале: зелёный — хорошо, жёлтый — средне, красный — мало.
export function percentTone(percent) {
  const value = Number(percent) || 0;
  if (value < 30) return "is-danger";
  if (value < 60) return "is-warning";
  return "is-good";
}

export function activeTimeTone(seconds) {
  const value = Number(seconds) || 0;
  if (value < 60) return "is-danger";
  if (value < 300) return "is-warning";
  return "is-good";
}

export function pluralRu(count, [one, few, many]) {
  const value = Math.abs(Number(count) || 0);
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
