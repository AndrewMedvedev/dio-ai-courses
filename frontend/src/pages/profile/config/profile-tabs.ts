// Вкладки личного кабинета.
export interface ProfileTabItem {
  id: string;
  label: string;
}

export const profileTabItems: ProfileTabItem[] = [
  { id: "overview", label: "Профиль" },
  { id: "active-course", label: "Активный курс" },
  { id: "teacher", label: "Кабинет автора" },
];
