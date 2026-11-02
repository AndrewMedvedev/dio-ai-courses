// Роли участника курса.

export type CourseMemberRole = "student" | "moderator" | "teacher";

export const COURSE_ROLES: ReadonlyArray<{
  id: CourseMemberRole;
  label: string;
  hint: string;
}> = [
  {
    id: "student",
    label: "Студент",
    hint: "Проходит курс: теория, практика, ИИ-ментор.",
  },
  {
    id: "moderator",
    label: "Модератор",
    hint: "Помогает вести курс, может приглашать студентов и модераторов.",
  },
  {
    id: "teacher",
    label: "Преподаватель",
    hint: "Редактирует курс и может приглашать участников с любой ролью.",
  },
];

export const COURSE_ROLE_LABEL: Record<string, string> = Object.fromEntries(
  COURSE_ROLES.map((role) => [role.id, role.label]),
);
