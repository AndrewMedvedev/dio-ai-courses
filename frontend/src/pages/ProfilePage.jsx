// Личный кабинет с карточками прогресса, навигацией по вкладкам и управлением потоками преподавателя
import { useEffect, useMemo, useState } from "react";
import SectionTop from "../components/SectionTop";
import { useAuthenticatedImage } from "../hooks/useAuthenticatedImage";
import { useSessionStore } from "../stores/sessionStore";

const AVATAR_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const AVATAR_MAX_SIZE_BYTES = 5 * 1024 * 1024;

function getDisplayName(user) {
  return (
    user?.full_name || user?.username || user?.email || "Загружаем профиль..."
  );
}

function getInitials(nameOrEmail) {
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

function validateUsername(value) {
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

function validateFullName(value) {
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

function validateProfileForm(values) {
  return {
    username: validateUsername(values.username),
    full_name: validateFullName(values.full_name),
  };
}

function hasErrors(errors) {
  return Object.values(errors).some(Boolean);
}

function validateAvatarFile(file) {
  if (!file) {
    throw new Error("Выберите файл для загрузки.");
  }
  if (!AVATAR_MIME_TYPES.has(file.type)) {
    throw new Error("Выберите изображение PNG, JPEG или WebP.");
  }
  if (file.size > AVATAR_MAX_SIZE_BYTES) {
    throw new Error("Максимальный размер аватара — 5 МБ.");
  }
}

export default function ProfilePage({
  profileTabItems,
  activeProfileTab,
  setActiveProfileTab,
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
  teacherGroups,
  activeTeacherGroup,
  setActiveTeacherGroupId,
  activeTeacherCourse,
  teacherGroupName,
  setTeacherGroupName,
  teacherCourseId,
  setTeacherCourseId,
  teacherStudentName,
  setTeacherStudentName,
  createTeacherGroup,
  addStudentToActiveGroup,
  adjustStudentProgress,
  simulateStudyTick,
  teacherLeaderboard,
  openCreator,
}) {
  const user = useSessionStore((state) => state.user);
  const loadCurrentUser = useSessionStore((state) => state.loadCurrentUser);
  const updateProfile = useSessionStore((state) => state.updateProfile);
  const uploadAvatar = useSessionStore((state) => state.uploadAvatar);
  const apiValidationErrors = useSessionStore(
    (state) => state.validationErrors,
  );
  const [profileForm, setProfileForm] = useState({
    username: "",
    full_name: "",
  });
  const [isProfileEditing, setIsProfileEditing] = useState(false);
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState("");
  const [formErrors, setFormErrors] = useState({});
  const [profileNotice, setProfileNotice] = useState("");
  const { imageUrl: savedAvatarUrl } = useAuthenticatedImage(user?.avatar_url, {
    enabled: Boolean(user?.avatar_url),
  });
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const isAuthorMode = activeProfileTab === "teacher";
  const visibleTabs = profileTabItems.filter((tab) =>
    isAuthorMode ? tab.id === "teacher" : tab.id !== "teacher",
  );
  const authoredCourses = coursesData.slice(0, 3);
  const displayName = useMemo(() => getDisplayName(user), [user]);
  const profileEmail = user?.email || "Email загружается...";
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
      username: user?.username || "",
      full_name: user?.full_name || "",
    });
  }, [user]);

  useEffect(() => {
    if (!avatarFile) {
      setAvatarPreviewUrl("");
      return undefined;
    }

    const objectUrl = URL.createObjectURL(avatarFile);
    setAvatarPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [avatarFile]);

  const updateProfileField = (field, value) => {
    setProfileForm((prev) => ({ ...prev, [field]: value }));
    setProfileNotice("");
    setFormErrors((prev) => ({ ...prev, [field]: "" }));
  };

  const resetProfileEdit = () => {
    setProfileForm({
      username: user?.username || "",
      full_name: user?.full_name || "",
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

  const handleAvatarFileChange = (event) => {
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
        avatar: error?.message || "Не удалось выбрать аватар.",
      }));
    }
  };

  const handleProfileSubmit = async (event) => {
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

    const changes = {};
    if ((user?.username || "") !== normalized.username) {
      changes.username = normalized.username || null;
    }
    if ((user?.full_name || "") !== normalized.full_name) {
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
    } catch (error) {
      setProfileNotice("");
      setFormErrors((prev) => ({
        ...prev,
        avatar:
          error?.step === "validation" || error?.step?.includes("upload")
            ? error.message
            : prev.avatar,
      }));
    } finally {
      setIsSavingProfile(false);
    }
  };

  return (
    <section className="container section profile-view">
      <SectionTop label="Профиль" title="Личный кабинет" />
      <div className="profile-layout">
        <aside className="profile-sidebar">
          <article className="glass-card profile-user-card">
            {savedAvatarUrl ? (
              <img
                className="profile-user-avatar profile-user-avatar-image"
                src={savedAvatarUrl}
                alt="Аватар пользователя"
              />
            ) : (
              <span className="profile-user-avatar">{initials}</span>
            )}
            <h3>{displayName}</h3>
            <p>{profileEmail}</p>
            <small className="profile-user-meta">
              {user?.username
                ? `@${user.username}`
                : "Данные аккаунта загружаются..."}
            </small>
          </article>

          <article className="glass-card profile-mode-card">
            <span>Режим кабинета</span>
            <div className="profile-mode-switch">
              <button
                type="button"
                className={!isAuthorMode ? "is-active" : ""}
                onClick={() => setActiveProfileTab("overview")}
              >
                Обучаюсь
              </button>
              <button
                type="button"
                className={isAuthorMode ? "is-active" : ""}
                onClick={() => setActiveProfileTab("teacher")}
              >
                Создаю курсы
              </button>
            </div>
          </article>

          <article className="glass-card profile-nav-card">
            <ul className="profile-nav-list">
              {visibleTabs.map((tab) => (
                <li key={tab.id}>
                  <button
                    type="button"
                    className={`profile-tab-btn ${activeProfileTab === tab.id ? "is-active" : ""}`}
                    onClick={() => setActiveProfileTab(tab.id)}
                  >
                    {tab.label}
                  </button>
                </li>
              ))}
            </ul>
          </article>
        </aside>

        <div className="profile-content">
          {activeProfileTab === "active-course" && (
            <article className="glass-card profile-track-card">
              <div className="profile-track-head">
                <div>
                  <span>Активный трек</span>
                  <h3>{profileActiveCourse.title}</h3>
                </div>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => openCourse(profileActiveCourse.id)}
                >
                  Продолжить
                </button>
              </div>
              <div className="profile-track-progress">
                <div>
                  <p>Общий прогресс</p>
                  <strong>{profileActiveCourseProgress}%</strong>
                </div>
                <div className="block-progress-bar">
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
              <article className="glass-card profile-edit-card">
                <div className="profile-edit-head">
                  <div>
                    <span>Данные аккаунта</span>
                    <h3>Профиль пользователя</h3>
                    <p>
                      Эти данные используются в личном кабинете и интерфейсе
                      платформы.
                    </p>
                  </div>
                  {!isProfileEditing && (
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={startProfileEdit}
                      disabled={!user}
                    >
                      Редактировать профиль
                    </button>
                  )}
                </div>

                {isProfileLoading && !user && (
                  <div className="profile-progress-note" role="status">
                    <span className="profile-spinner" aria-hidden="true" />
                    Загружаем данные профиля...
                  </div>
                )}

                {!isProfileEditing ? (
                  <div className="profile-summary-grid">
                    <div>
                      <span>Email</span>
                      <strong>{user?.email || "Загружается..."}</strong>
                    </div>
                    <div>
                      <span>Никнейм</span>
                      <strong>{user?.username || "Не указан"}</strong>
                    </div>
                    <div>
                      <span>ФИО</span>
                      <strong>{user?.full_name || "Не указано"}</strong>
                    </div>
                    <div>
                      <span>Аватар</span>
                      <strong>
                        {user?.avatar_url ? "Загружен" : "Не загружен"}
                      </strong>
                    </div>
                    {profileNotice && (
                      <p className="profile-edit-notice">{profileNotice}</p>
                    )}
                  </div>
                ) : (
                  <form
                    className="profile-edit-form"
                    onSubmit={handleProfileSubmit}
                    noValidate
                  >
                    <div className="profile-avatar-edit">
                      {avatarPreviewUrl || savedAvatarUrl ? (
                        <img
                          className="profile-user-avatar profile-user-avatar-image"
                          src={avatarPreviewUrl || savedAvatarUrl}
                          alt="Предпросмотр аватара"
                        />
                      ) : (
                        <span className="profile-user-avatar">{initials}</span>
                      )}
                      <label className="profile-avatar-upload">
                        <span>Аватар</span>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          onChange={handleAvatarFileChange}
                        />
                        <small>
                          PNG, JPEG или WebP до 5 МБ. Файл будет загружен в
                          хранилище.
                        </small>
                      </label>
                      {mergedErrors.avatar && (
                        <small className="auth-field-error">
                          {mergedErrors.avatar}
                        </small>
                      )}
                    </div>
                    <label>
                      <span>Email</span>
                      <input type="email" value={user?.email || ""} disabled />
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
                        <small className="auth-field-error">
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
                        <small className="auth-field-error">
                          {mergedErrors.full_name}
                        </small>
                      )}
                    </label>
                    <div className="profile-edit-actions">
                      <button
                        type="submit"
                        className="btn btn-solid"
                        disabled={isSavingProfile}
                      >
                        {isSavingProfile ? "Сохраняем..." : "Сохранить"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline"
                        onClick={cancelProfileEdit}
                        disabled={isSavingProfile}
                      >
                        Отмена
                      </button>
                      {isSavingProfile && (
                        <span className="profile-progress-note" role="status">
                          <span
                            className="profile-spinner"
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

              <div className="profile-stats-grid">
                <article className="glass-card profile-stat-card">
                  <span>Завершено</span>
                  <strong>
                    {completedLessonsCount + completedPracticesCount}
                  </strong>
                  <p>элементов из {totalContentCount}</p>
                </article>
              </div>
              <article className="glass-card profile-learner-create">
                <div>
                  <span>Нужна программа под другую цель?</span>
                  <h3>Создайте собственный курс с ИИ</h3>
                  <p>
                    Укажите тему, уровень и желаемый результат — конструктор
                    соберёт новый учебный маршрут.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-solid"
                  onClick={openCreator}
                >
                  Создать курс
                </button>
              </article>
              <div className="profile-info-grid">
                <article className="glass-card profile-info-card">
                  <h3>Ближайшие темы</h3>
                  <ul>
                    {profileUpcomingTopics.map((topic) => (
                      <li key={topic}>{topic}</li>
                    ))}
                  </ul>
                </article>
                <article className="glass-card profile-info-card">
                  <h3>Активность</h3>
                  <ul>
                    <li>Завершено уроков: {completedLessonsCount}</li>
                    <li>Выполнено практик: {completedPracticesCount}</li>
                    <li>Общий прогресс: {overallProgressPercent}%</li>
                  </ul>
                </article>
              </div>
            </>
          )}

          {activeProfileTab === "active-course" && (
            <article className="glass-card profile-detail-card">
              <h3>Блоки активного курса</h3>
              <ul className="profile-action-list">
                {profileActiveCourse.blocks.map((block) => (
                  <li key={block.id}>
                    <button
                      type="button"
                      className="profile-course-link"
                      onClick={() => openBlock(block.id)}
                    >
                      {block.title}
                    </button>
                  </li>
                ))}
              </ul>
            </article>
          )}

          {activeProfileTab === "teacher" && (
            <>
              <section className="author-dashboard">
                <div className="author-dashboard-head">
                  <div>
                    <span>Аналитика автора</span>
                    <h2>Ваши курсы растут</h2>
                    <p>Сводка по просмотрам, запускам и активности учеников.</p>
                  </div>
                </div>
                <div className="author-stats-grid">
                  <article className="glass-card">
                    <span>Покупки</span>
                    <strong>128</strong>
                    <small>+18% за месяц</small>
                  </article>
                  <article className="glass-card">
                    <span>Просмотры</span>
                    <strong>12,4 тыс.</strong>
                    <small>3,1 тыс. новых</small>
                  </article>
                  <article className="glass-card">
                    <span>Генерации</span>
                    <strong>386</strong>
                    <small>по вашим программам</small>
                  </article>
                  <article className="glass-card">
                    <span>Среднее прохождение</span>
                    <strong>18 дней</strong>
                    <small>на 3 дня быстрее</small>
                  </article>
                </div>
              </section>

              <div className="teacher-grid teacher-grid-in-profile">
                <div className="teacher-dashboard-column">
                  <article className="glass-card teacher-courses-card">
                    <h3>Созданные курсы</h3>
                    <p className="teacher-card-description">
                      Курсы, опубликованные автором на платформе.
                    </p>
                    <ul className="teacher-authored-course-list">
                      {authoredCourses.map((course) => {
                        const courseGroups = teacherGroups.filter(
                          (group) => group.courseId === course.id,
                        );
                        const studentsCount = courseGroups.reduce(
                          (total, group) => total + group.students.length,
                          0,
                        );

                        return (
                          <li key={course.id}>
                            <button
                              type="button"
                              className="teacher-authored-course-btn"
                              onClick={() => openCourse(course.id)}
                            >
                              <span className="teacher-authored-course-main">
                                <strong>{course.title}</strong>
                                <small>
                                  {course.category || "Авторский курс"}
                                </small>
                              </span>
                              <span className="teacher-authored-course-meta">
                                <span>{course.blocks?.length || 0} блоков</span>
                                <span>{studentsCount} учеников</span>
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </article>

                  <article className="glass-card teacher-groups-card">
                    <h3>Потоки преподавателя</h3>
                    <ul className="teacher-groups-list">
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
                              className={`teacher-group-btn ${group.id === activeTeacherGroup?.id ? "is-active" : ""}`}
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

                  <article className="glass-card teacher-leaderboard-card">
                    <h3>Лидерборд потока</h3>
                    {teacherLeaderboard.length === 0 ? (
                      <p className="teacher-empty">
                        Лидерборд появится после добавления учеников.
                      </p>
                    ) : (
                      <ol className="teacher-leaderboard-list">
                        {teacherLeaderboard.map((student, index) => (
                          <li key={`lb-${student.id}`}>
                            <span className="teacher-rank">{index + 1}</span>
                            <div className="teacher-rank-main">
                              <strong>{student.name}</strong>
                              <small>Уроков: {student.lessonsDone}</small>
                            </div>
                            <span className="teacher-rank-score">
                              {student.progress}%
                            </span>
                          </li>
                        ))}
                      </ol>
                    )}
                  </article>
                </div>

                <article className="glass-card teacher-students-card">
                  <div className="teacher-card-head">
                    <div>
                      <h3>Ученики в потоке</h3>
                      <p>
                        {activeTeacherGroup
                          ? activeTeacherGroup.name
                          : "Сначала создайте поток"}
                      </p>
                      <span className="teacher-chip">
                        {activeTeacherCourse?.title}
                      </span>
                    </div>
                  </div>

                  <div className="teacher-add-student">
                    <label>
                      <span>Новый ученик</span>
                      <input
                        type="text"
                        placeholder="Введите имя ученика"
                        value={teacherStudentName}
                        onChange={(event) =>
                          setTeacherStudentName(event.target.value)
                        }
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            addStudentToActiveGroup();
                          }
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={addStudentToActiveGroup}
                    >
                      Добавить в поток
                    </button>
                  </div>

                  {!activeTeacherGroup ||
                  activeTeacherGroup.students.length === 0 ? (
                    <p className="teacher-empty">
                      Пока нет учеников. Добавьте первого студента в поток.
                    </p>
                  ) : (
                    <ul className="teacher-students-list">
                      {activeTeacherGroup.students.map((student) => (
                        <li key={student.id} className="teacher-student-item">
                          <div className="teacher-student-row">
                            <strong>{student.name}</strong>
                            <span>{student.progress}%</span>
                          </div>
                          <div className="course-progress-track">
                            <div style={{ width: `${student.progress}%` }} />
                          </div>
                          <div className="teacher-student-actions">
                            <small>
                              Пройдено уроков: {student.lessonsDone}
                            </small>
                            <div>
                              <button
                                type="button"
                                onClick={() =>
                                  adjustStudentProgress(student.id, -5)
                                }
                              >
                                -5%
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  adjustStudentProgress(student.id, 5)
                                }
                              >
                                +5%
                              </button>
                              <button
                                type="button"
                                onClick={() => simulateStudyTick(student.id)}
                              >
                                Зачесть урок
                              </button>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </article>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
