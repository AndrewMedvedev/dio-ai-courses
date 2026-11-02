// Личный кабинет с карточками прогресса, навигацией по вкладкам и управлением потоками преподавателя
import {
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { SectionTop } from "@/shared/ui/section-top";
import {
  COURSE_PERMISSIONS,
  usePermissionStore,
  useSessionStore,
} from "@/entities/session";
import {
  useStudentStore,
  formatModulesCount,
  useCoursesModulesCount,
  fetchMyCoursesPage,
  formatCourseLevel,
  type CourseNode,
  type LearningCourse,
} from "@/entities/course";
import { useMyCoursesProgress } from "@/features/course-progress";
import { getMediaUrl, MEDIA_FOLDERS } from "@/shared/lib/media";
import { useUiLayoutStore } from "@/shared/lib/ui-layout";
import { profileTabItems } from "../config/profile-tabs";
import { useTeacherGroups } from "../model/use-teacher-groups";

interface ProfileForm {
  username: string;
  full_name: string;
}

type FormErrors = Record<string, string>;

interface CourseSummary {
  totalLessons: number;
  completedLessons: number;
  startedLessons: number;
  percent: number;
}

interface CoursesMeta {
  page: number;
  size: number;
  total: number;
  pages: number;
  has_next: boolean;
  has_prev: boolean;
}

const AVATAR_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const AVATAR_MAX_SIZE_BYTES = 15 * 1024 * 1024;

function getDisplayText(rawValue: unknown): string {
  const value = rawValue as Record<string, unknown> | string | number | null;
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  if (!value || typeof value !== "object") return "";

  return getDisplayText(
    value.value || value.label || value.name || value.email || value.username,
  );
}

function getDisplayName(user: Record<string, unknown> | null | undefined) {
  return (
    getDisplayText(user?.full_name) ||
    getDisplayText(user?.username) ||
    getDisplayText(user?.email) ||
    "Загружаем профиль..."
  );
}

function getInitials(nameOrEmail: string) {
  const value = String(nameOrEmail || "Профиль").trim();
  if (value.includes("@")) return value[0]?.toUpperCase() || "П";

  return (
    value
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "П"
  );
}

function validateUsername(value: string): string {
  if (!value) return "";
  if (value.length < 3 || value.length > 30) {
    return "Никнейм должен быть от 3 до 30 символов.";
  }
  if (!/^[A-Za-z0-9._-]+$/.test(value)) {
    return "Используйте латинские буквы, цифры, точку, дефис или подчёркивание.";
  }
  if (/^[._-]|[._-]$/.test(value)) {
    return "Никнейм не должен начинаться или заканчиваться спецсимволом.";
  }
  if (/[._-]{2}/.test(value)) {
    return "Никнейм не должен содержать два спецсимвола подряд.";
  }
  if (/^\d+$/.test(value)) {
    return "Никнейм не должен состоять только из цифр.";
  }
  return "";
}

function validateFullName(value: string): string {
  if (!value) return "";
  if (value.length > 155) return "ФИО должно быть не длиннее 155 символов.";
  if (!/^[\p{L}\s'-]+$/u.test(value)) {
    return "ФИО может содержать только буквы, пробелы, дефис и апостроф.";
  }
  if (value.trim().split(/\s+/).length < 2) {
    return "Укажите минимум имя и фамилию.";
  }
  return "";
}

function validateProfileForm(values: ProfileForm): FormErrors {
  return {
    username: validateUsername(values.username),
    full_name: validateFullName(values.full_name),
  };
}

function hasErrors(errors: FormErrors) {
  return Object.values(errors).some(Boolean);
}

const COURSE_STATUS_LABELS: Record<string, string> = {
  in_generation: "Генерируется",
  draft: "Черновик",
  invite_only: "Только по приглашению",
  published: "Опубликован",
  archived: "В архиве",
};

function getCourseStatusLabel(status: unknown): string {
  return (
    COURSE_STATUS_LABELS[String(status)] ||
    (status ? String(status) : "") ||
    "Статус не указан"
  );
}

function getApiErrorMessage(rawError: unknown, fallback: string): string {
  const error = rawError as { userMessage?: string; message?: string } | null;
  return error?.userMessage || error?.message || fallback;
}

function validateAvatarFile(file: File | null): asserts file is File {
  if (!file) {
    throw new Error("Выберите файл для загрузки.");
  }
  if (!AVATAR_MIME_TYPES.has(file.type)) {
    throw new Error("Выберите изображение PNG, JPEG или WebP.");
  }
  if (file.size > AVATAR_MAX_SIZE_BYTES) {
    throw new Error("Максимальный размер аватара — 15 МБ.");
  }
}

function CourseProgressLine({ summary }: { summary: CourseSummary }) {
  const status =
    summary.totalLessons > 0 &&
    summary.completedLessons === summary.totalLessons
      ? "completed"
      : summary.startedLessons > 0
        ? "in_progress"
        : "not_started";

  return (
    <span
      className={`profile-course-progress tw:col-[1_/_-1] tw:grid tw:gap-[6px] tw:mt-[4px] tw:text-(--muted) tw:text-[0.78rem] tw:[--profile-progress-done:#2f7d4f] tw:[--profile-progress-active:#a86a00] tw:[--profile-progress-track:rgba(var(--accent-rgb),_0.18)] tw:[&.is-loading]:italic tw:dark:[--profile-progress-done:#7fd19b] tw:dark:[--profile-progress-active:#f0c060] tw:dark:[--profile-progress-track:rgba(255,_255,_255,_0.12)] is-${status}`}
    >
      <span className="profile-course-progress-row tw:flex tw:items-baseline tw:justify-between tw:gap-[8px]">
        <span>
          {summary.startedLessons > 0
            ? `Пройдено уроков: ${summary.completedLessons} из ${summary.totalLessons}`
            : `Не начат · ${summary.totalLessons} уроков`}
        </span>
        <b className="tw:text-(--heading) tw:font-[800]">{summary.percent}%</b>
      </span>
      <span
        className="profile-course-progress-bar tw:block tw:h-[6px] tw:overflow-hidden tw:rounded-[999px] tw:[background:var(--profile-progress-track)]"
        role="progressbar"
        aria-label="Прогресс курса"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={summary.percent}
      >
        <span
          className="tw:block tw:h-[100%] tw:rounded-[inherit] tw:[background:var(--profile-progress-done)] tw:[transition:width_0.4s_ease]"
          style={{ width: `${summary.percent}%` }}
        />
      </span>
    </span>
  );
}

export interface ProfilePageProps {
  profileActiveCourse: CourseNode;
  profileActiveCourseProgress: number;
  profileActiveCourseTotal: number;
  profileActiveCourseCompleted: number;
  profileUpcomingTopics: (string | undefined)[];
  completedLessonsCount: number;
  completedPracticesCount: number;
  overallProgressPercent: number;
  totalContentCount: number;
  coursesData: CourseNode[];
  openCourse: (courseId: string | null | undefined) => void;
  openBlock: (blockId: string | null | undefined) => void;
  openCreator: () => void;
  canCreateCourse?: boolean;
  canUpdateCourse?: boolean;
  canDeleteCourse?: boolean;
}

/** Личный кабинет: профиль, мои курсы, активный курс и кабинет автора. */
export function ProfilePage({
  profileActiveCourse,
  profileActiveCourseProgress,
  profileActiveCourseTotal,
  profileActiveCourseCompleted,
  profileUpcomingTopics,
  completedLessonsCount,
  completedPracticesCount,
  overallProgressPercent,
  totalContentCount,
  coursesData,
  openCourse,
  openBlock,
  openCreator,
  canCreateCourse = false,
  canUpdateCourse = false,
  canDeleteCourse = false,
}: ProfilePageProps) {
  const activeProfileTab = useUiLayoutStore((state) => state.activeProfileTab);
  const setActiveProfileTab = useUiLayoutStore(
    (state) => state.setActiveProfileTab,
  );
  const {
    teacherGroups,
    activeTeacherGroup,
    setActiveTeacherGroupId,
    teacherLeaderboard,
  } = useTeacherGroups(coursesData, "");
  const user = useSessionStore((state) => state.user);
  const loadCurrentUser = useSessionStore((state) => state.loadCurrentUser);
  const updateProfile = useSessionStore((state) => state.updateProfile);
  const uploadAvatar = useSessionStore((state) => state.uploadAvatar);
  const hasPermission = usePermissionStore((state) => state.hasPermission);
  const apiValidationErrors = useSessionStore(
    (state) => state.validationErrors,
  );
  const [profileForm, setProfileForm] = useState<ProfileForm>({
    username: "",
    full_name: "",
  });
  const [isProfileEditing, setIsProfileEditing] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState("");
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [profileNotice, setProfileNotice] = useState("");
  const currentUserId = user?.id || user?.user_id || user?.userId;
  const savedAvatarUrl = getMediaUrl(
    currentUserId,
    MEDIA_FOLDERS.AVATAR,
    user?.avatar_url,
  );
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [myCoursesPage, setMyCoursesPage] = useState(1);
  const [authoredCoursesPage, setAuthoredCoursesPage] = useState(1);
  const [authoredCourses, setAuthoredCourses] = useState<LearningCourse[]>([]);
  const [authoredCoursesMeta, setAuthoredCoursesMeta] = useState<CoursesMeta>({
    page: 1,
    size: 6,
    total: 0,
    pages: 1,
    has_next: false,
    has_prev: false,
  });
  const [isAuthoredCoursesLoading, setIsAuthoredCoursesLoading] =
    useState(false);
  const [authoredCoursesError, setAuthoredCoursesError] = useState("");
  const myCourses = useStudentStore((state) => state.myCourses);
  const myCoursesMeta = useStudentStore((state) => state.myCoursesMeta);
  const isMyCoursesLoading = useStudentStore(
    (state) => state.isMyCoursesLoading,
  );
  const myCoursesError = useStudentStore((state) => state.myCoursesError);
  const loadMyCourses = useStudentStore((state) => state.loadMyCourses);
  // Реальный прогресс ученика с backend по курсам, на которые он записан.
  const myCoursesProgress = useMyCoursesProgress(myCourses, {
    enabled: activeProfileTab === "overview",
  });
  // Списки курсов приходят без модулей — число модулей дочитываем по каждому курсу.
  const myCoursesModules = useCoursesModulesCount(myCourses, {
    enabled: activeProfileTab === "overview",
  });
  const authoredCoursesModules = useCoursesModulesCount(authoredCourses, {
    enabled: activeProfileTab === "teacher",
  });
  const progressTotals = myCoursesProgress.hasData
    ? myCoursesProgress.totals
    : null;
  const shownCompletedLessons =
    progressTotals?.completedLessons ?? completedLessonsCount;
  const shownCompletedPractices =
    progressTotals?.completedPractices ?? completedPracticesCount;
  const shownOverallPercent = progressTotals?.percent ?? overallProgressPercent;

  const canUpdateOwnCourses =
    canUpdateCourse || hasPermission(COURSE_PERMISSIONS.UPDATE);
  const canDeleteOwnCourses =
    canDeleteCourse || hasPermission(COURSE_PERMISSIONS.DELETE);
  const canManageCourses =
    canCreateCourse || canUpdateOwnCourses || canDeleteOwnCourses;
  const isAuthorMode = canManageCourses && activeProfileTab === "teacher";
  const visibleTabs = profileTabItems.filter((tab) =>
    isAuthorMode ? tab.id === "teacher" : tab.id !== "teacher",
  );
  const displayName = useMemo(() => getDisplayName(user), [user]);
  const profileEmail = getDisplayText(user?.email) || "Email загружается...";
  const initials = getInitials(displayName);
  const mergedErrors = { ...formErrors, ...apiValidationErrors };

  useEffect(() => {
    if (!user) {
      setIsProfileLoading(true);
      loadCurrentUser().finally(() => setIsProfileLoading(false));
    }
  }, [loadCurrentUser, user]);

  useEffect(() => {
    setProfileForm({
      username: getDisplayText(user?.username),
      full_name: getDisplayText(user?.full_name),
    });
  }, [user]);

  useEffect(() => {
    if (!canManageCourses && activeProfileTab === "teacher") {
      setActiveProfileTab("overview");
    }
  }, [activeProfileTab, canManageCourses, setActiveProfileTab]);

  useEffect(() => {
    if (activeProfileTab !== "overview") {
      return undefined;
    }

    const controller = new AbortController();
    loadMyCourses(
      { page: myCoursesPage, size: myCoursesMeta.size || 10 },
      { signal: controller.signal },
    ).catch((error) => {
      if (!controller.signal.aborted) {
        getApiErrorMessage(error, "Не удалось загрузить ваши курсы.");
      }
    });

    return () => controller.abort();
  }, [activeProfileTab, loadMyCourses, myCoursesPage, myCoursesMeta.size]);

  useEffect(() => {
    if (!canManageCourses || activeProfileTab !== "teacher") {
      return undefined;
    }

    const controller = new AbortController();
    setIsAuthoredCoursesLoading(true);
    setAuthoredCoursesError("");

    fetchMyCoursesPage(
      { page: authoredCoursesPage, size: authoredCoursesMeta.size },
      { signal: controller.signal },
    )
      .then((response) => {
        setAuthoredCourses(response.items);
        setAuthoredCoursesMeta({
          page: response.page || authoredCoursesPage,
          size: response.size || authoredCoursesMeta.size,
          total: response.total || 0,
          pages: response.pages || response.total_pages || 1,
          has_next: Boolean(response.has_next),
          has_prev: Boolean(response.has_prev),
        });
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setAuthoredCourses([]);
        setAuthoredCoursesError(
          getApiErrorMessage(error, "Не удалось загрузить созданные курсы."),
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsAuthoredCoursesLoading(false);
        }
      });

    return () => controller.abort();
  }, [
    activeProfileTab,
    authoredCoursesPage,
    authoredCoursesMeta.size,
    canManageCourses,
  ]);

  useEffect(() => {
    if (!avatarFile) {
      setAvatarPreviewUrl("");
      return undefined;
    }

    const objectUrl = URL.createObjectURL(avatarFile);
    setAvatarPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [avatarFile]);

  const updateProfileField = (field: keyof ProfileForm, value: string) => {
    setProfileForm((prev) => ({ ...prev, [field]: value }));
    setProfileNotice("");
    setFormErrors((prev) => ({ ...prev, [field]: "" }));
  };

  const resetProfileEdit = () => {
    setProfileForm({
      username: getDisplayText(user?.username),
      full_name: getDisplayText(user?.full_name),
    });
    setAvatarFile(null);
    setFormErrors({});
    setProfileNotice("");
  };

  const startProfileEdit = () => {
    resetProfileEdit();
    setIsProfileEditing(true);
  };

  const cancelProfileEdit = () => {
    resetProfileEdit();
    setIsProfileEditing(false);
  };

  const handleAvatarFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    setProfileNotice("");
    setFormErrors((prev) => ({ ...prev, avatar: "" }));

    if (!file) {
      setAvatarFile(null);
      return;
    }

    try {
      validateAvatarFile(file);
      setAvatarFile(file);
    } catch (error) {
      setAvatarFile(null);
      setFormErrors((prev) => ({
        ...prev,
        avatar:
          (error as Error | null)?.message || "Не удалось выбрать аватар.",
      }));
    }
  };

  const handleProfileSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setProfileNotice("");
    setIsSavingProfile(true);

    const normalized = {
      username: profileForm.username.trim(),
      full_name: profileForm.full_name.trim(),
    };
    const nextErrors = validateProfileForm(normalized);
    setFormErrors(nextErrors);

    if (hasErrors(nextErrors)) {
      setIsSavingProfile(false);
      return;
    }

    const changes: Record<string, string | null> = {};
    if (getDisplayText(user?.username) !== normalized.username) {
      changes.username = normalized.username || null;
    }
    if (getDisplayText(user?.full_name) !== normalized.full_name) {
      changes.full_name = normalized.full_name || null;
    }

    try {
      let updatedUser = null;
      if (avatarFile) {
        setProfileNotice("Загружаем аватар...");
        updatedUser = await uploadAvatar(avatarFile);
      }

      if (Object.keys(changes).length) {
        setProfileNotice("Сохраняем профиль...");
        updatedUser = await updateProfile(changes);
      }

      if (!updatedUser) {
        setProfileNotice("Изменений для сохранения нет.");
        setIsSavingProfile(false);
        return;
      }
      setAvatarFile(null);
      setIsProfileEditing(false);
      setProfileNotice("Профиль обновлён.");
    } catch (rawError) {
      const error = rawError as { step?: string; message?: string } | null;
      setProfileNotice("");
      setFormErrors((prev) => ({
        ...prev,
        avatar:
          error?.step === "validation" || error?.step?.includes("upload")
            ? (error.message ?? "")
            : prev.avatar,
      }));
    } finally {
      setIsSavingProfile(false);
    }
  };

  return (
    <section className="container section profile-view tw:relative tw:z-[1] tw:w-[min(1360px,_96vw)] tw:max-w-[100%] tw:mt-[8px] tw:m-[0_auto] tw:min-1180:[&:has(.lesson-editor-block-row.has-ai)]:w-[min(1760px,_99vw)]">
      <SectionTop label="Профиль" title="Личный кабинет" />
      <div className="profile-layout tw:mt-[24px] tw:grid tw:grid-cols-[300px_1fr] tw:gap-[14px] tw:max-1100:grid-cols-[1fr]">
        <aside className="profile-sidebar tw:grid tw:gap-[14px] tw:[align-content:start]">
          <article className="glass-card profile-user-card tw:border-solid tw:border-(--glass-border) tw:rounded-[22px] tw:relative tw:overflow-hidden tw:isolate tw:p-[22px] tw:[border-width:1px] tw:hover:border-(--glass-glow) tw:[background:var(--glass-tint)] tw:[box-shadow:var(--glass-shadow),_var(--glass-inset)] tw:[backdrop-filter:blur(var(--glass-blur))] tw:[-webkit-backdrop-filter:blur(var(--glass-blur))] tw:max-760:p-[18px] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[background:var(--glass-bg)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[backdrop-filter:var(--glass-backdrop)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:[&::before]:absolute tw:[&::before]:inset-[0] tw:[&::before]:z-[0] tw:[&::before]:rounded-[inherit] tw:[&::before]:bg-(--glass-highlight) tw:[&::before]:[content:''] tw:[&::before]:[box-shadow:inset_0_0_20px_-5px_var(--glass-glow),_inset_0_1px_0_var(--glass-top-shine)] tw:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&]:[&::after]:[content:none] tw:[.course-viewer_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[background:var(--glass-bg-strong)] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.course-viewer_&_.glass-card]:[backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[backdrop-filter:none] tw:[.course-viewer_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[-webkit-backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[-webkit-backdrop-filter:none]">
            {savedAvatarUrl ? (
              <img
                className="profile-user-avatar profile-user-avatar-image tw:w-[88px] tw:h-[88px] tw:rounded-[26px] tw:inline-flex tw:items-center tw:justify-center tw:text-[2rem] tw:font-[700] tw:text-(--ink-accent) tw:object-cover tw:[background:rgba(var(--accent-rgb),_0.14)] tw:[border:1px_solid_rgba(var(--accent-rgb),_0.34)]"
                src={savedAvatarUrl}
                alt="Аватар пользователя"
              />
            ) : (
              <span className="profile-user-avatar tw:w-[88px] tw:h-[88px] tw:rounded-[26px] tw:inline-flex tw:items-center tw:justify-center tw:text-[2rem] tw:font-[700] tw:text-(--ink-accent) tw:[background:rgba(var(--accent-rgb),_0.14)] tw:[border:1px_solid_rgba(var(--accent-rgb),_0.34)]">
                {initials}
              </span>
            )}
            <h3 className="tw:mt-[14px] tw:text-[clamp(1.08rem,_1.8vw,_1.35rem)] tw:leading-[1.38] tw:tracking-[-0.008em] tw:[font-family:'Unbounded',_sans-serif]">
              {displayName}
            </h3>
            <p className="tw:m-[8px_0_0] tw:text-(--muted) tw:wrap-anywhere tw:text-[1rem] tw:leading-[1.72] tw:tracking-[0.012em]">
              {profileEmail}
            </p>
            <small className="profile-user-meta tw:block tw:mt-[8px] tw:text-(--ink-accent) tw:text-[0.82rem] tw:font-[800] tw:wrap-anywhere">
              {getDisplayText(user?.username)
                ? `@${getDisplayText(user?.username)}`
                : "Данные аккаунта загружаются..."}
            </small>
          </article>

          <article className="glass-card profile-mode-card tw:border-solid tw:border-(--glass-border) tw:rounded-[22px] tw:relative tw:overflow-hidden tw:isolate tw:p-[22px] tw:[border-width:1px] tw:hover:border-(--glass-glow) tw:[background:var(--glass-tint)] tw:[box-shadow:var(--glass-shadow),_var(--glass-inset)] tw:[backdrop-filter:blur(var(--glass-blur))] tw:[-webkit-backdrop-filter:blur(var(--glass-blur))] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[background:var(--glass-bg)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[backdrop-filter:var(--glass-backdrop)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:[&::before]:absolute tw:[&::before]:inset-[0] tw:[&::before]:z-[0] tw:[&::before]:rounded-[inherit] tw:[&::before]:bg-(--glass-highlight) tw:[&::before]:[content:''] tw:[&::before]:[box-shadow:inset_0_0_20px_-5px_var(--glass-glow),_inset_0_1px_0_var(--glass-top-shine)] tw:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&]:[&::after]:[content:none] tw:[.course-viewer_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[background:var(--glass-bg-strong)] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.course-viewer_&_.glass-card]:[backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[backdrop-filter:none] tw:[.course-viewer_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[-webkit-backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[-webkit-backdrop-filter:none]">
            <span className="tw:block tw:text-(--muted) tw:text-[0.74rem] tw:font-[800] tw:tracking-[0.08em] tw:uppercase">
              Режим кабинета
            </span>
            <div className="profile-mode-switch tw:mt-[10px] tw:grid tw:gap-[6px]">
              <button
                type="button"
                className={`tw:w-[100%] tw:border-solid tw:rounded-[10px] tw:p-[9px_10px] tw:text-left tw:cursor-pointer tw:[border-width:1px] tw:[&.is-active]:border-[rgba(var(--accent-rgb),_0.72)] tw:[&.is-active]:text-(--heading) tw:[font:inherit] tw:[&&]:font-[800] tw:[&&]:text-[0.96rem] tw:[&&]:leading-[1.45] tw:[&.is-active]:[background:rgba(var(--accent-rgb),_0.16)] ${!isAuthorMode ? "is-active" : ""}`}
                onClick={() => setActiveProfileTab("overview")}
              >
                Обучаюсь
              </button>
              {canManageCourses && (
                <button
                  type="button"
                  className={`tw:w-[100%] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.3)] tw:rounded-[10px] tw:text-(--muted) tw:p-[9px_10px] tw:text-left tw:cursor-pointer tw:[border-width:1px] tw:[.profile-mode-switch_&.is-active]:border-[rgba(var(--accent-rgb),_0.72)] tw:[background:transparent] tw:[.profile-mode-switch_&.is-active]:text-(--heading) tw:[font:inherit] tw:[&&]:font-[800] tw:[&&]:text-[0.96rem] tw:[&&]:leading-[1.45] tw:[.profile-mode-switch_&.is-active]:[background:rgba(var(--accent-rgb),_0.16)] ${isAuthorMode ? "is-active" : ""}`}
                  onClick={() => setActiveProfileTab("teacher")}
                >
                  Мои курсы
                </button>
              )}
            </div>
          </article>

          <article className="glass-card profile-nav-card tw:border-solid tw:border-(--glass-border) tw:rounded-[22px] tw:relative tw:overflow-hidden tw:isolate tw:p-[22px] tw:[border-width:1px] tw:hover:border-(--glass-glow) tw:[background:var(--glass-tint)] tw:[box-shadow:var(--glass-shadow),_var(--glass-inset)] tw:[backdrop-filter:blur(var(--glass-blur))] tw:[-webkit-backdrop-filter:blur(var(--glass-blur))] tw:max-760:p-[18px] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[background:var(--glass-bg)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[backdrop-filter:var(--glass-backdrop)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:[&::before]:absolute tw:[&::before]:inset-[0] tw:[&::before]:z-[0] tw:[&::before]:rounded-[inherit] tw:[&::before]:bg-(--glass-highlight) tw:[&::before]:[content:''] tw:[&::before]:[box-shadow:inset_0_0_20px_-5px_var(--glass-glow),_inset_0_1px_0_var(--glass-top-shine)] tw:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&]:[&::after]:[content:none] tw:[.course-viewer_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[background:var(--glass-bg-strong)] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.course-viewer_&_.glass-card]:[backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[backdrop-filter:none] tw:[.course-viewer_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[-webkit-backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[-webkit-backdrop-filter:none]">
            <ul className="profile-nav-list tw:m-[0] tw:p-[0] tw:grid tw:gap-[8px] tw:[list-style:none]">
              {visibleTabs.map((tab) => (
                <li
                  className="tw:text-[1rem] tw:leading-[1.72] tw:tracking-[0.012em]"
                  key={tab.id}
                >
                  <button
                    type="button"
                    className={`profile-tab-btn tw:w-[100%] tw:text-left tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.34)] tw:rounded-[12px] tw:text-(--text) tw:p-[12px_14px] tw:cursor-pointer tw:[border-width:1px] tw:[&.is-active]:border-[rgba(var(--accent-rgb),_0.72)] tw:[background:rgba(var(--accent-rgb),_0.08)] tw:[&.is-active]:text-(--ink-accent) tw:[font:inherit] tw:[&&]:font-[700] tw:[&&]:text-[0.96rem] tw:[&&]:leading-[1.45] tw:[&.is-active]:[background:rgba(var(--accent-rgb),_0.16)] ${activeProfileTab === tab.id ? "is-active" : ""}`}
                    onClick={() => setActiveProfileTab(tab.id)}
                  >
                    {tab.label}
                  </button>
                </li>
              ))}
            </ul>
          </article>
        </aside>

        <div className="profile-content tw:grid tw:gap-[14px] tw:[align-content:start]">
          {activeProfileTab === "active-course" && (
            <article className="glass-card profile-track-card tw:border-solid tw:border-(--glass-border) tw:rounded-[22px] tw:relative tw:overflow-hidden tw:isolate tw:p-[22px] tw:[border-width:1px] tw:hover:border-(--glass-glow) tw:[background:var(--glass-tint)] tw:[box-shadow:var(--glass-shadow),_var(--glass-inset)] tw:[backdrop-filter:blur(var(--glass-blur))] tw:[-webkit-backdrop-filter:blur(var(--glass-blur))] tw:max-760:p-[18px] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[background:var(--glass-bg)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[backdrop-filter:var(--glass-backdrop)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:[&::before]:absolute tw:[&::before]:inset-[0] tw:[&::before]:z-[0] tw:[&::before]:rounded-[inherit] tw:[&::before]:bg-(--glass-highlight) tw:[&::before]:[content:''] tw:[&::before]:[box-shadow:inset_0_0_20px_-5px_var(--glass-glow),_inset_0_1px_0_var(--glass-top-shine)] tw:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&]:[&::after]:[content:none] tw:[.course-viewer_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[background:var(--glass-bg-strong)] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.course-viewer_&_.glass-card]:[backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[backdrop-filter:none] tw:[.course-viewer_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[-webkit-backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[-webkit-backdrop-filter:none]">
              <div className="profile-track-head tw:flex tw:items-center tw:justify-between tw:gap-[12px]">
                <div>
                  <span>Активный трек</span>
                  <h3>{profileActiveCourse.title}</h3>
                </div>
                <button
                  type="button"
                  className="btn btn-outline tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:p-[12px_20px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.78)] tw:font-[700] tw:tracking-[0.01em] tw:text-(--ink-accent) tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:rgba(var(--accent-rgb),_0.14)] tw:[backdrop-filter:blur(24px)_saturate(145%)] tw:[-webkit-backdrop-filter:blur(24px)_saturate(145%)] tw:[box-shadow:var(--glass-inset),_0_8px_18px_rgba(79,_67,_48,_0.06)] tw:hover:[transform:translateY(-1px)]"
                  onClick={() => openCourse(profileActiveCourse.id)}
                >
                  Продолжить
                </button>
              </div>
              <div className="profile-track-progress tw:mt-[14px]">
                <div>
                  <p>Общий прогресс</p>
                  <strong>{profileActiveCourseProgress}%</strong>
                </div>
                <div className="block-progress-bar tw:mt-[8px] tw:w-[100%] tw:h-[10px] tw:rounded-[999px] tw:overflow-hidden tw:[background:rgba(var(--accent-rgb),_0.18)]">
                  <div style={{ width: `${profileActiveCourseProgress}%` }} />
                </div>
                <small>
                  Пройдено: {profileActiveCourseCompleted}/
                  {profileActiveCourseTotal}
                </small>
              </div>
            </article>
          )}

          {activeProfileTab === "overview" && (
            <>
              <article className="glass-card profile-edit-card tw:border-solid tw:border-(--glass-border) tw:rounded-[22px] tw:relative tw:overflow-hidden tw:isolate tw:p-[22px] tw:[border-width:1px] tw:hover:border-(--glass-glow) tw:[background:var(--glass-tint)] tw:[box-shadow:var(--glass-shadow),_var(--glass-inset)] tw:[backdrop-filter:blur(var(--glass-blur))] tw:[-webkit-backdrop-filter:blur(var(--glass-blur))] tw:max-760:p-[18px] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[background:var(--glass-bg)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[backdrop-filter:var(--glass-backdrop)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:[&::before]:absolute tw:[&::before]:inset-[0] tw:[&::before]:z-[0] tw:[&::before]:rounded-[inherit] tw:[&::before]:bg-(--glass-highlight) tw:[&::before]:[content:''] tw:[&::before]:[box-shadow:inset_0_0_20px_-5px_var(--glass-glow),_inset_0_1px_0_var(--glass-top-shine)] tw:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&]:[&::after]:[content:none] tw:[.course-viewer_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[background:var(--glass-bg-strong)] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.course-viewer_&_.glass-card]:[backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[backdrop-filter:none] tw:[.course-viewer_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[-webkit-backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[-webkit-backdrop-filter:none]">
                <div className="profile-edit-head tw:flex tw:items-center tw:justify-between tw:gap-[12px]">
                  <div>
                    <span className="tw:text-[0.78rem] tw:uppercase tw:tracking-[0.08em] tw:text-(--muted) tw:font-[700]">
                      Данные аккаунта
                    </span>
                    <h3 className="tw:mt-[8px] tw:text-[clamp(1.08rem,_1.8vw,_1.35rem)] tw:leading-[1.38] tw:tracking-[-0.008em]">
                      Профиль пользователя
                    </h3>
                    <p className="tw:m-[8px_0_0] tw:text-(--muted) tw:leading-[1.72] tw:text-[1rem] tw:tracking-[0.012em]">
                      Эти данные используются в личном кабинете и интерфейсе
                      платформы.
                    </p>
                  </div>
                  {!isProfileEditing && (
                    <button
                      type="button"
                      className="btn btn-outline tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:p-[12px_20px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.78)] tw:font-[700] tw:tracking-[0.01em] tw:text-(--ink-accent) tw:text-[0.96rem] tw:leading-[1.45] tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:rgba(var(--accent-rgb),_0.14)] tw:[backdrop-filter:blur(24px)_saturate(145%)] tw:[-webkit-backdrop-filter:blur(24px)_saturate(145%)] tw:[box-shadow:var(--glass-inset),_0_8px_18px_rgba(79,_67,_48,_0.06)] tw:hover:[transform:translateY(-1px)]"
                      onClick={startProfileEdit}
                      disabled={!user}
                    >
                      Редактировать профиль
                    </button>
                  )}
                </div>

                {isProfileLoading && !user && (
                  <div
                    className="profile-progress-note tw:col-[1_/_-1] tw:inline-flex tw:items-center tw:gap-[9px] tw:w-[fit-content] tw:mt-[14px] tw:rounded-[999px] tw:text-(--ink-accent) tw:p-[9px_12px] tw:text-[0.86rem] tw:font-[800] tw:[.profile-edit-actions_&]:mt-[0] tw:[border:1px_solid_rgba(var(--accent-rgb),_0.34)] tw:[background:rgba(var(--accent-rgb),_0.1)]"
                    role="status"
                  >
                    <span
                      className="profile-spinner tw:w-[14px] tw:h-[14px] tw:rounded-[999px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.24)] tw:[border-width:2px] tw:[border-top-color:var(--ink-accent)] tw:[animation:profile-spinner-rotate_0.8s_linear_infinite]"
                      aria-hidden="true"
                    />
                    Загружаем данные профиля...
                  </div>
                )}

                {!isProfileEditing ? (
                  <div className="profile-summary-grid tw:mt-[18px] tw:grid tw:grid-cols-[repeat(2,_minmax(0,_1fr))] tw:gap-[14px] tw:max-760:grid-cols-[1fr]">
                    <div className="tw:rounded-[12px] tw:p-[12px_14px] tw:[border:1px_solid_rgba(var(--accent-rgb),_0.24)] tw:[background:rgba(var(--accent-rgb),_0.06)]">
                      <span className="tw:block tw:text-(--muted) tw:text-[0.78rem] tw:font-[800] tw:uppercase tw:tracking-[0.06em]">
                        Email
                      </span>
                      <strong className="tw:block tw:mt-[7px] tw:text-(--text) tw:text-[0.95rem] tw:wrap-anywhere">
                        {getDisplayText(user?.email) || "Загружается..."}
                      </strong>
                    </div>
                    <div className="tw:rounded-[12px] tw:p-[12px_14px] tw:[border:1px_solid_rgba(var(--accent-rgb),_0.24)] tw:[background:rgba(var(--accent-rgb),_0.06)]">
                      <span className="tw:block tw:text-(--muted) tw:text-[0.78rem] tw:font-[800] tw:uppercase tw:tracking-[0.06em]">
                        Никнейм
                      </span>
                      <strong className="tw:block tw:mt-[7px] tw:text-(--text) tw:text-[0.95rem] tw:wrap-anywhere">
                        {getDisplayText(user?.username) || "Не указан"}
                      </strong>
                    </div>
                    <div className="tw:rounded-[12px] tw:p-[12px_14px] tw:[border:1px_solid_rgba(var(--accent-rgb),_0.24)] tw:[background:rgba(var(--accent-rgb),_0.06)]">
                      <span className="tw:block tw:text-(--muted) tw:text-[0.78rem] tw:font-[800] tw:uppercase tw:tracking-[0.06em]">
                        ФИО
                      </span>
                      <strong className="tw:block tw:mt-[7px] tw:text-(--text) tw:text-[0.95rem] tw:wrap-anywhere">
                        {getDisplayText(user?.full_name) || "Не указано"}
                      </strong>
                    </div>
                    <div className="tw:rounded-[12px] tw:p-[12px_14px] tw:[border:1px_solid_rgba(var(--accent-rgb),_0.24)] tw:[background:rgba(var(--accent-rgb),_0.06)]">
                      <span className="tw:block tw:text-(--muted) tw:text-[0.78rem] tw:font-[800] tw:uppercase tw:tracking-[0.06em]">
                        Аватар
                      </span>
                      <strong className="tw:block tw:mt-[7px] tw:text-(--text) tw:text-[0.95rem] tw:wrap-anywhere">
                        {user?.avatar_url ? "Загружен" : "Не загружен"}
                      </strong>
                    </div>
                    {profileNotice && (
                      <p className="profile-edit-notice tw:col-[1_/_-1] tw:m-[0] tw:text-(--ink-accent) tw:font-[800]">
                        {profileNotice}
                      </p>
                    )}
                  </div>
                ) : (
                  <form
                    className="profile-edit-form tw:mt-[18px] tw:grid tw:grid-cols-[repeat(2,_minmax(0,_1fr))] tw:gap-[14px] tw:max-760:grid-cols-[1fr]"
                    onSubmit={handleProfileSubmit}
                    noValidate
                  >
                    <div className="profile-avatar-edit tw:col-[1_/_-1] tw:grid tw:grid-cols-[auto_minmax(0,_1fr)] tw:items-center tw:gap-[14px] tw:rounded-[14px] tw:p-[14px] tw:max-760:grid-cols-[1fr] tw:[border:1px_solid_rgba(var(--accent-rgb),_0.24)] tw:[background:rgba(var(--accent-rgb),_0.06)]">
                      {avatarPreviewUrl || savedAvatarUrl ? (
                        <img
                          className="profile-user-avatar profile-user-avatar-image tw:w-[88px] tw:h-[88px] tw:rounded-[26px] tw:inline-flex tw:items-center tw:justify-center tw:text-[2rem] tw:font-[700] tw:text-(--ink-accent) tw:object-cover tw:[background:rgba(var(--accent-rgb),_0.14)] tw:[border:1px_solid_rgba(var(--accent-rgb),_0.34)]"
                          src={avatarPreviewUrl || savedAvatarUrl}
                          alt="Предпросмотр аватара"
                        />
                      ) : (
                        <span className="profile-user-avatar tw:w-[88px] tw:h-[88px] tw:rounded-[26px] tw:inline-flex tw:items-center tw:justify-center tw:text-[2rem] tw:font-[700] tw:text-(--ink-accent) tw:[background:rgba(var(--accent-rgb),_0.14)] tw:[border:1px_solid_rgba(var(--accent-rgb),_0.34)]">
                          {initials}
                        </span>
                      )}
                      <label className="profile-avatar-upload">
                        <span>Аватар</span>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          onChange={handleAvatarFileChange}
                        />
                        <small>
                          PNG, JPEG или WebP до 15 МБ. Файл будет загружен в
                          хранилище.
                        </small>
                      </label>
                      {mergedErrors.avatar && (
                        <small className="auth-field-error tw:block tw:p-[8px_10px] tw:rounded-[8px] tw:text-[#7a1b12] tw:text-[0.9rem] tw:font-[800] tw:leading-[1.35] tw:[background:rgba(180,_35,_24,_0.12)]">
                          {mergedErrors.avatar}
                        </small>
                      )}
                    </div>
                    <label>
                      <span>Email</span>
                      <input
                        type="email"
                        value={getDisplayText(user?.email)}
                        disabled
                      />
                    </label>
                    <label>
                      <span>Никнейм</span>
                      <input
                        type="text"
                        value={profileForm.username}
                        onChange={(event) =>
                          updateProfileField("username", event.target.value)
                        }
                        placeholder="ivan.ivanov"
                        aria-invalid={Boolean(mergedErrors.username)}
                      />
                      {mergedErrors.username && (
                        <small className="auth-field-error tw:block tw:p-[8px_10px] tw:rounded-[8px] tw:text-[#7a1b12] tw:text-[0.9rem] tw:font-[800] tw:leading-[1.35] tw:[background:rgba(180,_35,_24,_0.12)]">
                          {mergedErrors.username}
                        </small>
                      )}
                    </label>
                    <label>
                      <span>ФИО</span>
                      <input
                        type="text"
                        value={profileForm.full_name}
                        onChange={(event) =>
                          updateProfileField("full_name", event.target.value)
                        }
                        placeholder="Иванов Иван"
                        aria-invalid={Boolean(mergedErrors.full_name)}
                      />
                      {mergedErrors.full_name && (
                        <small className="auth-field-error tw:block tw:p-[8px_10px] tw:rounded-[8px] tw:text-[#7a1b12] tw:text-[0.9rem] tw:font-[800] tw:leading-[1.35] tw:[background:rgba(180,_35,_24,_0.12)]">
                          {mergedErrors.full_name}
                        </small>
                      )}
                    </label>
                    <div className="profile-edit-actions tw:col-[1_/_-1] tw:flex tw:items-center tw:gap-[14px] tw:flex-wrap">
                      <button
                        type="submit"
                        className="btn btn-solid tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:p-[12px_20px] tw:border-solid tw:border-(--cta) tw:font-[700] tw:tracking-[0.01em] tw:text-(--text-solid) tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:var(--cta)] tw:hover:[transform:translateY(-1px)]"
                        disabled={isSavingProfile}
                      >
                        {isSavingProfile ? "Сохраняем..." : "Сохранить"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:p-[12px_20px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.78)] tw:font-[700] tw:tracking-[0.01em] tw:text-(--ink-accent) tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:rgba(var(--accent-rgb),_0.14)] tw:[backdrop-filter:blur(24px)_saturate(145%)] tw:[-webkit-backdrop-filter:blur(24px)_saturate(145%)] tw:[box-shadow:var(--glass-inset),_0_8px_18px_rgba(79,_67,_48,_0.06)] tw:hover:[transform:translateY(-1px)]"
                        onClick={cancelProfileEdit}
                        disabled={isSavingProfile}
                      >
                        Отмена
                      </button>
                      {isSavingProfile && (
                        <span
                          className="profile-progress-note tw:col-[1_/_-1] tw:inline-flex tw:items-center tw:gap-[9px] tw:w-[fit-content] tw:mt-[14px] tw:rounded-[999px] tw:text-(--ink-accent) tw:p-[9px_12px] tw:text-[0.86rem] tw:font-[800] tw:[.profile-edit-actions_&]:mt-[0] tw:[border:1px_solid_rgba(var(--accent-rgb),_0.34)] tw:[background:rgba(var(--accent-rgb),_0.1)]"
                          role="status"
                        >
                          <span
                            className="profile-spinner tw:w-[14px] tw:h-[14px] tw:rounded-[999px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.24)] tw:[border-width:2px] tw:[border-top-color:var(--ink-accent)] tw:[animation:profile-spinner-rotate_0.8s_linear_infinite]"
                            aria-hidden="true"
                          />
                          {profileNotice || "Сохраняем изменения..."}
                        </span>
                      )}
                      {!isSavingProfile && profileNotice && (
                        <p>{profileNotice}</p>
                      )}
                    </div>
                  </form>
                )}
              </article>

              <article className="glass-card profile-my-courses-card profile-learner-courses-card tw:border-solid tw:border-(--glass-border) tw:rounded-[22px] tw:relative tw:overflow-hidden tw:isolate tw:w-[100%] tw:p-[22px] tw:[border-width:1px] tw:hover:border-(--glass-glow) tw:[background:var(--glass-tint)] tw:[box-shadow:var(--glass-shadow),_var(--glass-inset)] tw:[backdrop-filter:blur(var(--glass-blur))] tw:[-webkit-backdrop-filter:blur(var(--glass-blur))] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[background:var(--glass-bg)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[backdrop-filter:var(--glass-backdrop)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:[&::before]:absolute tw:[&::before]:inset-[0] tw:[&::before]:z-[0] tw:[&::before]:rounded-[inherit] tw:[&::before]:bg-(--glass-highlight) tw:[&::before]:[content:''] tw:[&::before]:[box-shadow:inset_0_0_20px_-5px_var(--glass-glow),_inset_0_1px_0_var(--glass-top-shine)] tw:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&]:[&::after]:[content:none] tw:[.course-viewer_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[background:var(--glass-bg-strong)] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.course-viewer_&_.glass-card]:[backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[backdrop-filter:none] tw:[.course-viewer_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[-webkit-backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[-webkit-backdrop-filter:none]">
                <div className="profile-my-courses-head tw:flex tw:items-start tw:justify-between tw:gap-[12px] tw:mb-[14px] tw:max-760:flex-col">
                  <div>
                    <h3 className="tw:text-[clamp(1.08rem,_1.8vw,_1.35rem)] tw:leading-[1.38] tw:tracking-[-0.008em] tw:[font-family:'Unbounded',_sans-serif]">
                      Мои курсы
                    </h3>
                    <p className="teacher-card-description tw:m-[8px_0_0] tw:text-(--muted) tw:text-[1rem] tw:leading-[1.72] tw:tracking-[0.012em]">
                      Курсы, на которые вы записаны.
                    </p>
                  </div>
                </div>
                {isMyCoursesLoading && (
                  <p
                    className="profile-progress-note tw:col-[1_/_-1] tw:inline-flex tw:items-center tw:gap-[9px] tw:w-[fit-content] tw:mt-[14px] tw:rounded-[999px] tw:text-(--ink-accent) tw:p-[9px_12px] tw:text-[1rem] tw:font-[800] tw:leading-[1.72] tw:tracking-[0.012em] tw:[.profile-edit-actions_&]:mt-[0] tw:[border:1px_solid_rgba(var(--accent-rgb),_0.34)] tw:[background:rgba(var(--accent-rgb),_0.1)]"
                    role="status"
                  >
                    <span
                      className="profile-spinner tw:w-[14px] tw:h-[14px] tw:rounded-[999px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.24)] tw:[border-width:2px] tw:[border-top-color:var(--ink-accent)] tw:[animation:profile-spinner-rotate_0.8s_linear_infinite]"
                      aria-hidden="true"
                    />
                    Загружаем ваши курсы...
                  </p>
                )}
                {myCoursesError && (
                  <p
                    className="auth-field-error tw:block tw:p-[8px_10px] tw:rounded-[8px] tw:text-[#7a1b12] tw:text-[0.9rem] tw:font-[800] tw:leading-[1.35] tw:[background:rgba(180,_35,_24,_0.12)]"
                    role="alert"
                  >
                    {myCoursesError}
                  </p>
                )}
                {!isMyCoursesLoading &&
                  !myCoursesError &&
                  myCourses.length === 0 && (
                    <p className="teacher-empty tw:m-[14px_0_0] tw:text-(--muted) tw:text-[1rem] tw:leading-[1.72] tw:tracking-[0.012em]">
                      Вы пока не записаны ни на один курс.
                    </p>
                  )}
                {!isMyCoursesLoading &&
                  !myCoursesError &&
                  myCourses.length > 0 && (
                    <ul className="teacher-authored-course-list profile-my-course-list tw:mt-[0] tw:m-[14px_0_0] tw:p-[0] tw:grid tw:gap-[12px] tw:[list-style:none]">
                      {myCourses.map((course) => {
                        const courseProgress =
                          myCoursesProgress.byCourseId[course.id];
                        const modulesCount =
                          courseProgress?.modulesCount ??
                          myCoursesModules[course.id] ??
                          (course.blocks?.length || null);
                        return (
                          <li
                            key={course.id}
                            className="profile-my-course-item tw:grid tw:gap-[10px] tw:rounded-[14px] tw:p-[10px] tw:text-[1rem] tw:leading-[1.72] tw:tracking-[0.012em] tw:[border:1px_solid_rgba(var(--accent-rgb),_0.22)] tw:[background:rgba(var(--accent-rgb),_0.05)]"
                          >
                            <div className="profile-my-course-summary tw:grid tw:gap-[6px]">
                              <div
                                className="teacher-authored-course-btn profile-my-course-card tw:w-[100%] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.36)] tw:rounded-[12px] tw:text-(--text) tw:p-[11px_12px] tw:grid tw:justify-between tw:gap-[14px] tw:text-left tw:cursor-pointer tw:grid-cols-[minmax(0,_1fr)_auto] tw:[border-width:1px] tw:hover:border-[rgba(var(--accent-rgb),_0.72)] tw:[background:rgba(var(--accent-rgb),_0.1)] tw:dark:text-(--heading) tw:[align-items:start] tw:[font:inherit] tw:hover:[background:rgba(var(--accent-rgb),_0.16)]"
                                role="button"
                                tabIndex={0}
                                onClick={() => openCourse(course.id)}
                                onKeyDown={(event) => {
                                  if (
                                    event.key === "Enter" ||
                                    event.key === " "
                                  ) {
                                    event.preventDefault();
                                    openCourse(course.id);
                                  }
                                }}
                              >
                                <span className="teacher-authored-course-main tw:min-w-[0] tw:grid tw:gap-[4px]">
                                  <strong
                                    className="tw:overflow-visible tw:text-clip tw:whitespace-normal tw:text-[0.9rem] tw:leading-[1.35]"
                                    title={course.title}
                                  >
                                    {course.title}
                                  </strong>
                                  <small className="tw:text-(--muted) tw:text-[0.76rem]">
                                    {course.category ||
                                      (course.difficulty &&
                                        formatCourseLevel(course.difficulty)) ||
                                      "Курс"}
                                  </small>
                                </span>
                                <span className="teacher-authored-course-meta tw:text-(--muted) tw:text-[0.76rem] tw:flex-[0_0_auto] tw:grid tw:gap-[3px] tw:min-w-[max-content] tw:[justify-items:end]">
                                  <span>
                                    {getCourseStatusLabel(course.status)}
                                  </span>
                                  {modulesCount !== null && (
                                    <span>
                                      {formatModulesCount(modulesCount)}
                                    </span>
                                  )}
                                </span>
                                {courseProgress && (
                                  <CourseProgressLine
                                    summary={courseProgress}
                                  />
                                )}
                                {!courseProgress &&
                                  myCoursesProgress.isLoading &&
                                  !(
                                    course.id in myCoursesProgress.byCourseId
                                  ) && (
                                    <span className="profile-course-progress is-loading tw:col-[1_/_-1] tw:grid tw:gap-[6px] tw:mt-[4px] tw:text-(--muted) tw:text-[0.78rem] tw:italic tw:[--profile-progress-done:#2f7d4f] tw:[--profile-progress-active:#a86a00] tw:[--profile-progress-track:rgba(var(--accent-rgb),_0.18)] tw:dark:[--profile-progress-done:#7fd19b] tw:dark:[--profile-progress-active:#f0c060] tw:dark:[--profile-progress-track:rgba(255,_255,_255,_0.12)]">
                                      Загружаем прогресс...
                                    </span>
                                  )}
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                {myCoursesMeta.pages > 1 && (
                  <nav
                    className="courses-pagination tw:mt-[22px] tw:flex tw:items-center tw:justify-between tw:gap-[14px] tw:text-(--muted) tw:text-[0.94rem]"
                    aria-label="Пагинация моих курсов"
                  >
                    <span>
                      Всего: {myCoursesMeta.total}. Страница{" "}
                      {myCoursesMeta.page} из {myCoursesMeta.pages}
                    </span>
                    <div className="courses-pagination-actions tw:flex tw:items-center tw:flex-wrap tw:gap-[8px]">
                      <button
                        type="button"
                        className="btn btn-outline tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:p-[12px_20px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.78)] tw:font-[700] tw:tracking-[0.01em] tw:text-(--ink-accent) tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:rgba(var(--accent-rgb),_0.14)] tw:[backdrop-filter:blur(24px)_saturate(145%)] tw:[-webkit-backdrop-filter:blur(24px)_saturate(145%)] tw:[box-shadow:var(--glass-inset),_0_8px_18px_rgba(79,_67,_48,_0.06)] tw:hover:[transform:translateY(-1px)]"
                        onClick={() =>
                          setMyCoursesPage((page) => Math.max(1, page - 1))
                        }
                        disabled={!myCoursesMeta.has_prev || isMyCoursesLoading}
                      >
                        Назад
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:p-[12px_20px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.78)] tw:font-[700] tw:tracking-[0.01em] tw:text-(--ink-accent) tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:rgba(var(--accent-rgb),_0.14)] tw:[backdrop-filter:blur(24px)_saturate(145%)] tw:[-webkit-backdrop-filter:blur(24px)_saturate(145%)] tw:[box-shadow:var(--glass-inset),_0_8px_18px_rgba(79,_67,_48,_0.06)] tw:hover:[transform:translateY(-1px)]"
                        onClick={() =>
                          setMyCoursesPage((page) =>
                            Math.min(myCoursesMeta.pages, page + 1),
                          )
                        }
                        disabled={!myCoursesMeta.has_next || isMyCoursesLoading}
                      >
                        Вперёд
                      </button>
                    </div>
                  </nav>
                )}
              </article>

              {canCreateCourse && (
                <article className="glass-card profile-learner-create tw:border-solid tw:border-(--glass-border) tw:rounded-[22px] tw:relative tw:overflow-hidden tw:isolate tw:p-[22px] tw:flex tw:items-center tw:justify-between tw:gap-[22px] tw:[border-width:1px] tw:hover:border-(--glass-glow) tw:[background:var(--glass-tint)] tw:[box-shadow:var(--glass-shadow),_var(--glass-inset)] tw:[backdrop-filter:blur(var(--glass-blur))] tw:[-webkit-backdrop-filter:blur(var(--glass-blur))] tw:max-760:items-start tw:max-760:flex-col tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[background:var(--glass-bg)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[backdrop-filter:var(--glass-backdrop)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:[&::before]:absolute tw:[&::before]:inset-[0] tw:[&::before]:z-[0] tw:[&::before]:rounded-[inherit] tw:[&::before]:bg-(--glass-highlight) tw:[&::before]:[content:''] tw:[&::before]:[box-shadow:inset_0_0_20px_-5px_var(--glass-glow),_inset_0_1px_0_var(--glass-top-shine)] tw:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&]:[&::after]:[content:none] tw:[.course-viewer_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[background:var(--glass-bg-strong)] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.course-viewer_&_.glass-card]:[backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[backdrop-filter:none] tw:[.course-viewer_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[-webkit-backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[-webkit-backdrop-filter:none]">
                  <div className="tw:max-w-[650px]">
                    <span className="tw:text-(--eyebrow) tw:text-[0.76rem] tw:font-[800] tw:tracking-[0.08em] tw:uppercase">
                      Нужна программа под другую цель?
                    </span>
                    <h3 className="tw:mt-[7px] tw:text-[clamp(1.08rem,_1.8vw,_1.35rem)] tw:leading-[1.38] tw:tracking-[-0.008em] tw:[font-family:'Unbounded',_sans-serif]">
                      Создайте собственный курс с ИИ
                    </h3>
                    <p className="tw:m-[9px_0_0] tw:text-(--muted) tw:leading-[1.72] tw:text-[1rem] tw:tracking-[0.012em]">
                      Укажите тему, уровень и желаемый результат — конструктор
                      соберёт новый учебный маршрут.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-solid tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:p-[12px_20px] tw:border-solid tw:border-(--cta) tw:font-[700] tw:tracking-[0.01em] tw:text-(--text-solid) tw:text-[0.96rem] tw:leading-[1.45] tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:var(--cta)] tw:hover:[transform:translateY(-1px)]"
                    onClick={openCreator}
                  >
                    Создать курс
                  </button>
                </article>
              )}
              <div className="profile-info-grid tw:grid tw:grid-cols-[1fr_1fr] tw:gap-[14px] tw:max-1100:grid-cols-[1fr]">
                <article className="glass-card profile-info-card tw:border-solid tw:border-(--glass-border) tw:rounded-[22px] tw:relative tw:overflow-hidden tw:isolate tw:p-[22px] tw:[border-width:1px] tw:hover:border-(--glass-glow) tw:[background:var(--glass-tint)] tw:[box-shadow:var(--glass-shadow),_var(--glass-inset)] tw:[backdrop-filter:blur(var(--glass-blur))] tw:[-webkit-backdrop-filter:blur(var(--glass-blur))] tw:max-760:p-[18px] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[background:var(--glass-bg)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[backdrop-filter:var(--glass-backdrop)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:[&::before]:absolute tw:[&::before]:inset-[0] tw:[&::before]:z-[0] tw:[&::before]:rounded-[inherit] tw:[&::before]:bg-(--glass-highlight) tw:[&::before]:[content:''] tw:[&::before]:[box-shadow:inset_0_0_20px_-5px_var(--glass-glow),_inset_0_1px_0_var(--glass-top-shine)] tw:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&]:[&::after]:[content:none] tw:[.course-viewer_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[background:var(--glass-bg-strong)] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.course-viewer_&_.glass-card]:[backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[backdrop-filter:none] tw:[.course-viewer_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[-webkit-backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[-webkit-backdrop-filter:none]">
                  <h3 className="tw:text-[clamp(1.08rem,_1.8vw,_1.35rem)] tw:leading-[1.38] tw:tracking-[-0.008em]">
                    Ближайшие темы
                  </h3>
                  <ul className="tw:m-[12px_0_0] tw:pl-[18px] tw:text-(--muted) tw:grid tw:gap-[8px]">
                    {profileUpcomingTopics.map((topic) => (
                      <li key={topic}>{topic}</li>
                    ))}
                  </ul>
                </article>
                <article className="glass-card profile-info-card tw:border-solid tw:border-(--glass-border) tw:rounded-[22px] tw:relative tw:overflow-hidden tw:isolate tw:p-[22px] tw:[border-width:1px] tw:hover:border-(--glass-glow) tw:[background:var(--glass-tint)] tw:[box-shadow:var(--glass-shadow),_var(--glass-inset)] tw:[backdrop-filter:blur(var(--glass-blur))] tw:[-webkit-backdrop-filter:blur(var(--glass-blur))] tw:max-760:p-[18px] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[background:var(--glass-bg)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[backdrop-filter:var(--glass-backdrop)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:[&::before]:absolute tw:[&::before]:inset-[0] tw:[&::before]:z-[0] tw:[&::before]:rounded-[inherit] tw:[&::before]:bg-(--glass-highlight) tw:[&::before]:[content:''] tw:[&::before]:[box-shadow:inset_0_0_20px_-5px_var(--glass-glow),_inset_0_1px_0_var(--glass-top-shine)] tw:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&]:[&::after]:[content:none] tw:[.course-viewer_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[background:var(--glass-bg-strong)] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.course-viewer_&_.glass-card]:[backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[backdrop-filter:none] tw:[.course-viewer_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[-webkit-backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[-webkit-backdrop-filter:none]">
                  <h3 className="tw:text-[clamp(1.08rem,_1.8vw,_1.35rem)] tw:leading-[1.38] tw:tracking-[-0.008em]">
                    Активность
                  </h3>
                  <ul className="tw:m-[12px_0_0] tw:pl-[18px] tw:text-(--muted) tw:grid tw:gap-[8px]">
                    <li className="tw:text-[1rem] tw:leading-[1.72] tw:tracking-[0.012em]">
                      Завершено уроков: {shownCompletedLessons}
                    </li>
                    <li className="tw:text-[1rem] tw:leading-[1.72] tw:tracking-[0.012em]">
                      Выполнено практик: {shownCompletedPractices}
                    </li>
                    {progressTotals && (
                      <li className="tw:text-[1rem] tw:leading-[1.72] tw:tracking-[0.012em]">
                        Сдано тестов: {progressTotals.completedTests}
                      </li>
                    )}
                    <li className="tw:text-[1rem] tw:leading-[1.72] tw:tracking-[0.012em]">
                      Общий прогресс: {shownOverallPercent}%
                    </li>
                  </ul>
                </article>
              </div>
            </>
          )}

          {activeProfileTab === "active-course" && (
            <article className="glass-card profile-detail-card tw:border-solid tw:border-(--glass-border) tw:rounded-[22px] tw:relative tw:overflow-hidden tw:isolate tw:p-[22px] tw:[border-width:1px] tw:hover:border-(--glass-glow) tw:[background:var(--glass-tint)] tw:[box-shadow:var(--glass-shadow),_var(--glass-inset)] tw:[backdrop-filter:blur(var(--glass-blur))] tw:[-webkit-backdrop-filter:blur(var(--glass-blur))] tw:max-760:p-[18px] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[background:var(--glass-bg)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[backdrop-filter:var(--glass-backdrop)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:[&::before]:absolute tw:[&::before]:inset-[0] tw:[&::before]:z-[0] tw:[&::before]:rounded-[inherit] tw:[&::before]:bg-(--glass-highlight) tw:[&::before]:[content:''] tw:[&::before]:[box-shadow:inset_0_0_20px_-5px_var(--glass-glow),_inset_0_1px_0_var(--glass-top-shine)] tw:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&]:[&::after]:[content:none] tw:[.course-viewer_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[background:var(--glass-bg-strong)] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.course-viewer_&_.glass-card]:[backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[backdrop-filter:none] tw:[.course-viewer_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[-webkit-backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[-webkit-backdrop-filter:none]">
              <h3>Блоки активного курса</h3>
              <ul className="profile-action-list tw:m-[12px_0_0] tw:p-[0] tw:text-(--muted) tw:grid tw:gap-[8px] tw:[list-style:none]">
                {(profileActiveCourse.blocks || []).map((block) => (
                  <li key={block.id}>
                    <button
                      type="button"
                      className="profile-course-link tw:w-[100%] tw:text-left tw:rounded-[12px] tw:text-(--ink-accent) tw:p-[10px_12px] tw:cursor-pointer tw:[border:1px_solid_rgba(var(--accent-rgb),_0.36)] tw:[background:rgba(var(--accent-rgb),_0.1)] tw:[font:inherit]"
                      onClick={() => openBlock(block.id)}
                    >
                      {block.title}
                    </button>
                  </li>
                ))}
              </ul>
            </article>
          )}

          {canManageCourses && activeProfileTab === "teacher" && (
            <>
              <section className="author-dashboard tw:grid tw:gap-[16px]">
                <div className="author-dashboard-head tw:flex tw:justify-between tw:gap-[20px] tw:[align-items:end] tw:max-760:items-start tw:max-760:flex-col">
                  <div>
                    <span>Аналитика автора</span>
                    <h2>Ваши курсы растут</h2>
                    <p>Сводка по просмотрам, запускам и активности учеников.</p>
                  </div>
                </div>
                <div className="author-stats-grid tw:grid tw:grid-cols-[repeat(4,_minmax(0,_1fr))] tw:gap-[10px] tw:max-1100:grid-cols-[repeat(2,_minmax(0,_1fr))] tw:max-760:grid-cols-[1fr]">
                  <article className="glass-card tw:border-solid tw:border-(--glass-border) tw:rounded-[22px] tw:relative tw:overflow-hidden tw:isolate tw:[border-width:1px] tw:hover:border-(--glass-glow) tw:[background:var(--glass-tint)] tw:[box-shadow:var(--glass-shadow),_var(--glass-inset)] tw:[backdrop-filter:blur(var(--glass-blur))] tw:[-webkit-backdrop-filter:blur(var(--glass-blur))] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[background:var(--glass-bg)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[backdrop-filter:var(--glass-backdrop)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:[&::before]:absolute tw:[&::before]:inset-[0] tw:[&::before]:z-[0] tw:[&::before]:rounded-[inherit] tw:[&::before]:bg-(--glass-highlight) tw:[&::before]:[content:''] tw:[&::before]:[box-shadow:inset_0_0_20px_-5px_var(--glass-glow),_inset_0_1px_0_var(--glass-top-shine)] tw:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&]:[&::after]:[content:none] tw:[.course-viewer_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[background:var(--glass-bg-strong)] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.course-viewer_&_.glass-card]:[backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[backdrop-filter:none] tw:[.course-viewer_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[-webkit-backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[-webkit-backdrop-filter:none]">
                    <span>Покупки</span>
                    <strong>128</strong>
                    <small>+18% за месяц</small>
                  </article>
                  <article className="glass-card tw:border-solid tw:border-(--glass-border) tw:rounded-[22px] tw:relative tw:overflow-hidden tw:isolate tw:[border-width:1px] tw:hover:border-(--glass-glow) tw:[background:var(--glass-tint)] tw:[box-shadow:var(--glass-shadow),_var(--glass-inset)] tw:[backdrop-filter:blur(var(--glass-blur))] tw:[-webkit-backdrop-filter:blur(var(--glass-blur))] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[background:var(--glass-bg)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[backdrop-filter:var(--glass-backdrop)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:[&::before]:absolute tw:[&::before]:inset-[0] tw:[&::before]:z-[0] tw:[&::before]:rounded-[inherit] tw:[&::before]:bg-(--glass-highlight) tw:[&::before]:[content:''] tw:[&::before]:[box-shadow:inset_0_0_20px_-5px_var(--glass-glow),_inset_0_1px_0_var(--glass-top-shine)] tw:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&]:[&::after]:[content:none] tw:[.course-viewer_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[background:var(--glass-bg-strong)] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.course-viewer_&_.glass-card]:[backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[backdrop-filter:none] tw:[.course-viewer_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[-webkit-backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[-webkit-backdrop-filter:none]">
                    <span>Просмотры</span>
                    <strong>12,4 тыс.</strong>
                    <small>3,1 тыс. новых</small>
                  </article>
                  <article className="glass-card tw:border-solid tw:border-(--glass-border) tw:rounded-[22px] tw:relative tw:overflow-hidden tw:isolate tw:[border-width:1px] tw:hover:border-(--glass-glow) tw:[background:var(--glass-tint)] tw:[box-shadow:var(--glass-shadow),_var(--glass-inset)] tw:[backdrop-filter:blur(var(--glass-blur))] tw:[-webkit-backdrop-filter:blur(var(--glass-blur))] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[background:var(--glass-bg)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[backdrop-filter:var(--glass-backdrop)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:[&::before]:absolute tw:[&::before]:inset-[0] tw:[&::before]:z-[0] tw:[&::before]:rounded-[inherit] tw:[&::before]:bg-(--glass-highlight) tw:[&::before]:[content:''] tw:[&::before]:[box-shadow:inset_0_0_20px_-5px_var(--glass-glow),_inset_0_1px_0_var(--glass-top-shine)] tw:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&]:[&::after]:[content:none] tw:[.course-viewer_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[background:var(--glass-bg-strong)] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.course-viewer_&_.glass-card]:[backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[backdrop-filter:none] tw:[.course-viewer_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[-webkit-backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[-webkit-backdrop-filter:none]">
                    <span>Генерации</span>
                    <strong>386</strong>
                    <small>по вашим программам</small>
                  </article>
                  <article className="glass-card tw:border-solid tw:border-(--glass-border) tw:rounded-[22px] tw:relative tw:overflow-hidden tw:isolate tw:[border-width:1px] tw:hover:border-(--glass-glow) tw:[background:var(--glass-tint)] tw:[box-shadow:var(--glass-shadow),_var(--glass-inset)] tw:[backdrop-filter:blur(var(--glass-blur))] tw:[-webkit-backdrop-filter:blur(var(--glass-blur))] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[background:var(--glass-bg)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[backdrop-filter:var(--glass-backdrop)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:[&::before]:absolute tw:[&::before]:inset-[0] tw:[&::before]:z-[0] tw:[&::before]:rounded-[inherit] tw:[&::before]:bg-(--glass-highlight) tw:[&::before]:[content:''] tw:[&::before]:[box-shadow:inset_0_0_20px_-5px_var(--glass-glow),_inset_0_1px_0_var(--glass-top-shine)] tw:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&]:[&::after]:[content:none] tw:[.course-viewer_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[background:var(--glass-bg-strong)] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.course-viewer_&_.glass-card]:[backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[backdrop-filter:none] tw:[.course-viewer_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[-webkit-backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[-webkit-backdrop-filter:none]">
                    <span>Среднее прохождение</span>
                    <strong>18 дней</strong>
                    <small>на 3 дня быстрее</small>
                  </article>
                </div>
              </section>

              <div className="teacher-grid teacher-grid-in-profile tw:mt-[0] tw:grid tw:grid-cols-[minmax(0,_1fr)] tw:gap-[14px] tw:max-1100:grid-cols-[1fr] tw:[align-items:start]">
                <div className="teacher-dashboard-column tw:grid tw:gap-[14px] tw:[align-content:start]">
                  <article className="glass-card teacher-courses-card profile-my-courses-card tw:border-solid tw:border-(--glass-border) tw:rounded-[22px] tw:relative tw:overflow-hidden tw:isolate tw:p-[22px] tw:w-[100%] tw:[border-width:1px] tw:hover:border-(--glass-glow) tw:[background:var(--glass-tint)] tw:[box-shadow:var(--glass-shadow),_var(--glass-inset)] tw:[backdrop-filter:blur(var(--glass-blur))] tw:[-webkit-backdrop-filter:blur(var(--glass-blur))] tw:max-760:p-[18px] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[background:var(--glass-bg)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[backdrop-filter:var(--glass-backdrop)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:[&::before]:absolute tw:[&::before]:inset-[0] tw:[&::before]:z-[0] tw:[&::before]:rounded-[inherit] tw:[&::before]:bg-(--glass-highlight) tw:[&::before]:[content:''] tw:[&::before]:[box-shadow:inset_0_0_20px_-5px_var(--glass-glow),_inset_0_1px_0_var(--glass-top-shine)] tw:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&]:[&::after]:[content:none] tw:[.course-viewer_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[background:var(--glass-bg-strong)] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.course-viewer_&_.glass-card]:[backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[backdrop-filter:none] tw:[.course-viewer_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[-webkit-backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[-webkit-backdrop-filter:none]">
                    <div className="profile-my-courses-head tw:flex tw:items-start tw:justify-between tw:gap-[12px] tw:[.profile-learner-courses-card_&]:mb-[14px] tw:max-760:flex-col">
                      <div>
                        <h3>Мои курсы</h3>
                        <p className="teacher-card-description tw:m-[8px_0_0] tw:text-(--muted) tw:text-[0.86rem] tw:leading-[1.5]">
                          Курсы текущего пользователя с редактированием и
                          управлением статусом.
                        </p>
                      </div>
                      {canCreateCourse && (
                        <button
                          type="button"
                          className="btn btn-solid tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:p-[12px_20px] tw:border-solid tw:border-(--cta) tw:font-[700] tw:tracking-[0.01em] tw:text-(--text-solid) tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:var(--cta)] tw:hover:[transform:translateY(-1px)]"
                          onClick={openCreator}
                        >
                          Создать курс
                        </button>
                      )}
                    </div>

                    {isAuthoredCoursesLoading && (
                      <p
                        className="profile-progress-note tw:col-[1_/_-1] tw:inline-flex tw:items-center tw:gap-[9px] tw:w-[fit-content] tw:mt-[14px] tw:rounded-[999px] tw:text-(--ink-accent) tw:p-[9px_12px] tw:text-[0.86rem] tw:font-[800] tw:[.profile-edit-actions_&]:mt-[0] tw:[border:1px_solid_rgba(var(--accent-rgb),_0.34)] tw:[background:rgba(var(--accent-rgb),_0.1)]"
                        role="status"
                      >
                        <span
                          className="profile-spinner tw:w-[14px] tw:h-[14px] tw:rounded-[999px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.24)] tw:[border-width:2px] tw:[border-top-color:var(--ink-accent)] tw:[animation:profile-spinner-rotate_0.8s_linear_infinite]"
                          aria-hidden="true"
                        />
                        Загружаем созданные курсы...
                      </p>
                    )}
                    {authoredCoursesError && (
                      <p className="auth-field-error tw:block tw:p-[8px_10px] tw:rounded-[8px] tw:text-[#7a1b12] tw:text-[0.9rem] tw:font-[800] tw:leading-[1.35] tw:[background:rgba(180,_35,_24,_0.12)]">
                        {authoredCoursesError}
                      </p>
                    )}
                    {!isAuthoredCoursesLoading &&
                      !authoredCoursesError &&
                      authoredCourses.length === 0 && (
                        <p className="teacher-empty tw:m-[14px_0_0] tw:text-(--muted)">
                          У вас пока нет созданных курсов.
                        </p>
                      )}
                    <ul className="teacher-authored-course-list profile-my-course-list tw:m-[14px_0_0] tw:p-[0] tw:grid tw:gap-[12px] tw:[.profile-learner-courses-card_&]:mt-[0] tw:[list-style:none]">
                      {authoredCourses.map((course) => {
                        const modulesCount =
                          authoredCoursesModules[course.id] ??
                          (course.blocks?.length || null);
                        return (
                          <li
                            key={course.id}
                            className="profile-my-course-item tw:grid tw:gap-[10px] tw:rounded-[14px] tw:p-[10px] tw:[border:1px_solid_rgba(var(--accent-rgb),_0.22)] tw:[background:rgba(var(--accent-rgb),_0.05)]"
                          >
                            <div className="profile-my-course-summary tw:grid tw:gap-[6px]">
                              <div
                                className="teacher-authored-course-btn profile-my-course-card tw:w-[100%] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.36)] tw:rounded-[12px] tw:text-(--text) tw:p-[11px_12px] tw:flex tw:justify-between tw:items-center tw:gap-[14px] tw:text-left tw:cursor-pointer tw:[border-width:1px] tw:hover:border-[rgba(var(--accent-rgb),_0.72)] tw:[background:rgba(var(--accent-rgb),_0.1)] tw:[.profile-my-course-summary_&]:grid tw:[font:inherit] tw:[.profile-my-course-summary_&]:grid-cols-[minmax(0,_1fr)_auto] tw:hover:[background:rgba(var(--accent-rgb),_0.16)] tw:dark:[.page_&]:text-(--heading) tw:[.profile-my-course-summary_&]:[align-items:start]"
                                role="button"
                                tabIndex={0}
                                onClick={() => openCourse(course.id)}
                                onKeyDown={(event) => {
                                  if (
                                    event.key === "Enter" ||
                                    event.key === " "
                                  ) {
                                    event.preventDefault();
                                    openCourse(course.id);
                                  }
                                }}
                              >
                                <span className="teacher-authored-course-main tw:min-w-[0] tw:grid tw:gap-[4px]">
                                  <strong title={course.title}>
                                    {course.title}
                                  </strong>
                                  <small>
                                    {course.category ||
                                      (course.difficulty &&
                                        formatCourseLevel(course.difficulty)) ||
                                      "Авторский курс"}
                                  </small>
                                </span>
                                <span className="teacher-authored-course-meta tw:text-(--muted) tw:text-[0.76rem] tw:flex-[0_0_auto] tw:grid tw:gap-[3px] tw:[justify-items:end] tw:[.profile-my-course-summary_&]:min-w-[max-content]">
                                  <span>
                                    {getCourseStatusLabel(course.status)}
                                  </span>
                                  {modulesCount !== null && (
                                    <span>
                                      {formatModulesCount(modulesCount)}
                                    </span>
                                  )}
                                </span>
                              </div>
                              {!canUpdateOwnCourses && !canDeleteOwnCourses && (
                                <small className="profile-readonly-note tw:text-(--muted) tw:text-[0.78rem]">
                                  Read-only: нет прав управления курсами.
                                </small>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>

                    {authoredCoursesMeta.pages > 1 && (
                      <nav
                        className="courses-pagination tw:mt-[22px] tw:flex tw:items-center tw:justify-between tw:gap-[14px] tw:text-(--muted) tw:text-[0.94rem]"
                        aria-label="Пагинация созданных курсов"
                      >
                        <span>
                          Всего: {authoredCoursesMeta.total}. Страница{" "}
                          {authoredCoursesMeta.page} из{" "}
                          {authoredCoursesMeta.pages}
                        </span>
                        <div className="courses-pagination-actions tw:flex tw:items-center tw:flex-wrap tw:gap-[8px]">
                          <button
                            type="button"
                            className="btn btn-outline tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:p-[12px_20px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.78)] tw:font-[700] tw:tracking-[0.01em] tw:text-(--ink-accent) tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:rgba(var(--accent-rgb),_0.14)] tw:[backdrop-filter:blur(24px)_saturate(145%)] tw:[-webkit-backdrop-filter:blur(24px)_saturate(145%)] tw:[box-shadow:var(--glass-inset),_0_8px_18px_rgba(79,_67,_48,_0.06)] tw:hover:[transform:translateY(-1px)]"
                            onClick={() =>
                              setAuthoredCoursesPage((page) =>
                                Math.max(1, page - 1),
                              )
                            }
                            disabled={
                              !authoredCoursesMeta.has_prev ||
                              isAuthoredCoursesLoading
                            }
                          >
                            Назад
                          </button>
                          <button
                            type="button"
                            className="btn btn-outline tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:p-[12px_20px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.78)] tw:font-[700] tw:tracking-[0.01em] tw:text-(--ink-accent) tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:rgba(var(--accent-rgb),_0.14)] tw:[backdrop-filter:blur(24px)_saturate(145%)] tw:[-webkit-backdrop-filter:blur(24px)_saturate(145%)] tw:[box-shadow:var(--glass-inset),_0_8px_18px_rgba(79,_67,_48,_0.06)] tw:hover:[transform:translateY(-1px)]"
                            onClick={() =>
                              setAuthoredCoursesPage((page) =>
                                Math.min(authoredCoursesMeta.pages, page + 1),
                              )
                            }
                            disabled={
                              !authoredCoursesMeta.has_next ||
                              isAuthoredCoursesLoading
                            }
                          >
                            Вперёд
                          </button>
                        </div>
                      </nav>
                    )}
                  </article>

                  <article className="glass-card teacher-groups-card tw:border-solid tw:border-(--glass-border) tw:rounded-[22px] tw:relative tw:overflow-hidden tw:isolate tw:p-[22px] tw:[border-width:1px] tw:hover:border-(--glass-glow) tw:[background:var(--glass-tint)] tw:[box-shadow:var(--glass-shadow),_var(--glass-inset)] tw:[backdrop-filter:blur(var(--glass-blur))] tw:[-webkit-backdrop-filter:blur(var(--glass-blur))] tw:max-760:p-[18px] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[background:var(--glass-bg)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[backdrop-filter:var(--glass-backdrop)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:[&::before]:absolute tw:[&::before]:inset-[0] tw:[&::before]:z-[0] tw:[&::before]:rounded-[inherit] tw:[&::before]:bg-(--glass-highlight) tw:[&::before]:[content:''] tw:[&::before]:[box-shadow:inset_0_0_20px_-5px_var(--glass-glow),_inset_0_1px_0_var(--glass-top-shine)] tw:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&]:[&::after]:[content:none] tw:[.course-viewer_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[background:var(--glass-bg-strong)] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.course-viewer_&_.glass-card]:[backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[backdrop-filter:none] tw:[.course-viewer_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[-webkit-backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[-webkit-backdrop-filter:none]">
                    <h3>Потоки преподавателя</h3>
                    <ul className="teacher-groups-list tw:m-[12px_0_0] tw:p-[0] tw:grid tw:gap-[8px] tw:[list-style:none]">
                      {teacherGroups.map((group) => {
                        const groupCourse = coursesData.find(
                          (course) => course.id === group.courseId,
                        );
                        const groupAverageProgress =
                          group.students.length === 0
                            ? 0
                            : Math.round(
                                group.students.reduce(
                                  (total, student) => total + student.progress,
                                  0,
                                ) / group.students.length,
                              );
                        return (
                          <li key={group.id}>
                            <button
                              type="button"
                              className={`teacher-group-btn tw:w-[100%] tw:text-left tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.36)] tw:rounded-[12px] tw:p-[10px_12px] tw:cursor-pointer tw:grid tw:gap-[4px] tw:text-(--text) tw:[border-width:1px] tw:[&.is-active]:border-[rgba(var(--accent-rgb),_0.8)] tw:[background:rgba(var(--accent-rgb),_0.1)] tw:[font:inherit] tw:[&.is-active]:[box-shadow:0_0_0_1px_rgba(var(--accent-rgb),_0.2)_inset] ${group.id === activeTeacherGroup?.id ? "is-active" : ""}`}
                              onClick={() => setActiveTeacherGroupId(group.id)}
                            >
                              <strong>{group.name}</strong>
                              <span>
                                {groupCourse?.title || "Курс не выбран"}
                              </span>
                              <span>
                                {group.students.length} учеников • средний
                                прогресс {groupAverageProgress}%
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </article>

                  <article className="glass-card teacher-leaderboard-card tw:border-solid tw:border-(--glass-border) tw:rounded-[22px] tw:relative tw:overflow-hidden tw:isolate tw:p-[22px] tw:[border-width:1px] tw:hover:border-(--glass-glow) tw:[background:var(--glass-tint)] tw:[box-shadow:var(--glass-shadow),_var(--glass-inset)] tw:[backdrop-filter:blur(var(--glass-blur))] tw:[-webkit-backdrop-filter:blur(var(--glass-blur))] tw:max-760:p-[18px] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[background:var(--glass-bg)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[backdrop-filter:var(--glass-backdrop)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:[&::before]:absolute tw:[&::before]:inset-[0] tw:[&::before]:z-[0] tw:[&::before]:rounded-[inherit] tw:[&::before]:bg-(--glass-highlight) tw:[&::before]:[content:''] tw:[&::before]:[box-shadow:inset_0_0_20px_-5px_var(--glass-glow),_inset_0_1px_0_var(--glass-top-shine)] tw:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&]:[&::after]:[content:none] tw:[.course-viewer_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[background:var(--glass-bg-strong)] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.course-viewer_&_.glass-card]:[backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[backdrop-filter:none] tw:[.course-viewer_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[-webkit-backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[-webkit-backdrop-filter:none]">
                    <h3>Лидерборд потока</h3>
                    {teacherLeaderboard.length === 0 ? (
                      <p className="teacher-empty tw:m-[14px_0_0] tw:text-(--muted)">
                        Лидерборд появится после добавления учеников.
                      </p>
                    ) : (
                      <ol className="teacher-leaderboard-list tw:m-[12px_0_0] tw:p-[0] tw:grid tw:gap-[8px] tw:[list-style:none] tw:[counter-reset:leaderboard]">
                        {teacherLeaderboard.map((student, index) => (
                          <li key={`lb-${student.id}`}>
                            <span className="teacher-rank tw:w-[28px] tw:h-[28px] tw:rounded-[50%] tw:inline-flex tw:items-center tw:justify-center tw:font-[700] tw:text-[0.8rem] tw:text-(--ink-accent) tw:[background:rgba(var(--accent-rgb),_0.24)]">
                              {index + 1}
                            </span>
                            <div className="teacher-rank-main">
                              <strong>{student.name}</strong>
                              <small>Уроков: {student.lessonsDone}</small>
                            </div>
                            <span className="teacher-rank-score tw:font-[700] tw:text-(--ink-muted-strong) tw:dark:[.page_&]:text-(--heading)">
                              {student.progress}%
                            </span>
                          </li>
                        ))}
                      </ol>
                    )}
                  </article>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
