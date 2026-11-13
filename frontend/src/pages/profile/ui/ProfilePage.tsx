import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useSessionStore } from '@/entities/session';
import type { CourseNode } from '@/entities/course';
import { getMediaUrl, MEDIA_FOLDERS } from '@/shared/lib/media';
import { getErrorMessage } from '@/shared/lib/errors';
import { useUiLayoutStore } from '@/shared/lib/ui-layout';

interface ProfileForm {
  username: string;
  full_name: string;
}
type FormErrors = Record<string, string>;
const AVATAR_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const AVATAR_MAX_SIZE_BYTES = 15 * 1024 * 1024;

function getDisplayText(rawValue: unknown): string {
  const value = rawValue as Record<string, unknown> | string | number | null;
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  if (!value || typeof value !== 'object') return '';

  return getDisplayText(
    value.value || value.label || value.name || value.email || value.username,
  );
}

function getDisplayName(user: Record<string, unknown> | null | undefined) {
  return (
    getDisplayText(user?.full_name) ||
    getDisplayText(user?.username) ||
    getDisplayText(user?.email) ||
    'Загружаем профиль...'
  );
}

function getInitials(nameOrEmail: string) {
  const value = String(nameOrEmail || 'Профиль').trim();
  if (value.includes('@')) return value[0]?.toUpperCase() || 'П';

  return (
    value
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase() || 'П'
  );
}

function validateUsername(value: string): string {
  if (!value) return '';
  if (value.length < 3 || value.length > 30) {
    return 'Никнейм должен быть от 3 до 30 символов.';
  }
  if (!/^[A-Za-z0-9._-]+$/.test(value)) {
    return 'Используйте латинские буквы, цифры, точку, дефис или подчёркивание.';
  }
  if (/^[._-]|[._-]$/.test(value)) {
    return 'Никнейм не должен начинаться или заканчиваться спецсимволом.';
  }
  if (/[._-]{2}/.test(value)) {
    return 'Никнейм не должен содержать два спецсимвола подряд.';
  }
  if (/^\d+$/.test(value)) {
    return 'Никнейм не должен состоять только из цифр.';
  }
  return '';
}

function validateFullName(value: string): string {
  if (!value) return '';
  if (value.length > 155) return 'ФИО должно быть не длиннее 155 символов.';
  if (!/^[\p{L}\s'-]+$/u.test(value)) {
    return 'ФИО может содержать только буквы, пробелы, дефис и апостроф.';
  }
  if (value.trim().split(/\s+/).length < 2) {
    return 'Укажите минимум имя и фамилию.';
  }
  return '';
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

function validateAvatarFile(file: File | null): asserts file is File {
  if (!file) {
    throw new Error('Выберите файл для загрузки.');
  }
  if (!AVATAR_MIME_TYPES.has(file.type)) {
    throw new Error('Выберите изображение PNG, JPEG или WebP.');
  }
  if (file.size > AVATAR_MAX_SIZE_BYTES) {
    throw new Error('Максимальный размер аватара — 15 МБ.');
  }
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

export function ProfilePage({
  profileActiveCourse,
  profileActiveCourseProgress,
  profileActiveCourseTotal,
  profileActiveCourseCompleted,
  openCourse,
  openBlock,
}: ProfilePageProps) {
  const user = useSessionStore((state) => state.user);
  const loadCurrentUser = useSessionStore((state) => state.loadCurrentUser);
  const updateProfile = useSessionStore((state) => state.updateProfile);
  const uploadAvatar = useSessionStore((state) => state.uploadAvatar);
  const apiErrors = useSessionStore((state) => state.validationErrors);
  const sessionError = useSessionStore((state) => state.error);
  const storedTab = useUiLayoutStore((state) => state.activeProfileTab);
  const setTab = useUiLayoutStore((state) => state.setActiveProfileTab);
  const tab = storedTab === 'active-course' ? 'active-course' : 'overview';
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<ProfileForm>({
    username: '',
    full_name: '',
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [notice, setNotice] = useState('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState('');
  const displayName = getDisplayName(user);
  const email = getDisplayText(user?.email);
  const username = getDisplayText(user?.username);
  const avatarUrl =
    avatarPreview ||
    getMediaUrl(
      user?.id || user?.user_id,
      MEDIA_FOLDERS.AVATAR,
      user?.avatar_url,
    );
  const fieldErrors = { ...apiErrors, ...errors };

  useEffect(() => {
    if (!user) void loadCurrentUser();
  }, [loadCurrentUser, user]);
  useEffect(() => {
    setForm({
      username: getDisplayText(user?.username),
      full_name: getDisplayText(user?.full_name),
    });
  }, [user]);
  useEffect(() => {
    if (!avatarFile) {
      setAvatarPreview('');
      return;
    }
    const url = URL.createObjectURL(avatarFile);
    setAvatarPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [avatarFile]);

  function cancel() {
    setEditing(false);
    setAvatarFile(null);
    setErrors({});
    setNotice('');
    setForm({ username, full_name: getDisplayText(user?.full_name) });
  }
  function selectAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] || null;
    event.target.value = '';
    if (!file) return;
    try {
      validateAvatarFile(file);
      setAvatarFile(file);
      setErrors((value) => ({ ...value, avatar: '' }));
    } catch (cause) {
      setErrors((value) => ({
        ...value,
        avatar:
          getErrorMessage(cause, 'Не удалось выбрать изображение.') ||
          'Не удалось выбрать изображение.',
      }));
    }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const normalized = {
      username: form.username.trim(),
      full_name: form.full_name.trim(),
    };
    const validation = validateProfileForm(normalized);
    setErrors(validation);
    setNotice('');
    if (hasErrors(validation)) return;
    const changes: Record<string, string | null> = {};
    if (normalized.username !== username)
      changes.username = normalized.username || null;
    if (normalized.full_name !== getDisplayText(user?.full_name))
      changes.full_name = normalized.full_name || null;
    setSaving(true);
    try {
      if (avatarFile) await uploadAvatar(avatarFile);
      if (Object.keys(changes).length) await updateProfile(changes);
      setAvatarFile(null);
      setEditing(false);
      setNotice('Профиль обновлён.');
    } catch (cause) {
      setNotice(
        getErrorMessage(cause, 'Не удалось сохранить профиль.') ||
          'Не удалось сохранить профиль.',
      );
    } finally {
      setSaving(false);
    }
  }
  const panel =
    'tw:rounded-[22px] tw:border tw:border-solid tw:border-(--glass-border) tw:bg-(--panel-bg) tw:p-[22px]';
  const button =
    'tw:[font-family:inherit] tw:min-h-[46px] tw:rounded-full tw:border tw:border-solid tw:border-(--line-strong) tw:bg-transparent tw:px-[20px] tw:py-[12px] tw:text-(--text) tw:text-[14px] tw:font-semibold tw:cursor-pointer tw:disabled:opacity-50 tw:disabled:cursor-wait';
  const field =
    'tw:box-border tw:w-full tw:rounded-[12px] tw:border tw:border-solid tw:border-(--line) tw:bg-(--surface) tw:p-[14px] tw:text-(--text) tw:[font:inherit] tw:disabled:opacity-60';
  return (
    <section className="container section profile-view">
      <p className="tw:mt-[8px] tw:mb-[24px] tw:text-[12px] tw:font-bold tw:text-(--eyebrow)">
        Профиль
      </p>
      <h1 className="tw:mb-[24px] tw:border-0 tw:border-b tw:border-solid tw:border-(--line) tw:pb-[24px] tw:text-[28px] tw:[font-family:Unbounded,sans-serif]">
        Личный кабинет
      </h1>
      <div className="profile-layout tw:grid tw:grid-cols-[300px_minmax(0,1fr)] tw:items-start tw:gap-[14px] tw:max-1100:grid-cols-1">
        <aside className="profile-sidebar tw:grid tw:gap-[14px]">
          <article className={`${panel} profile-user-card`}>
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt="Аватар пользователя"
                className="tw:size-[88px] tw:rounded-[26px] tw:object-cover"
              />
            ) : (
              <span className="tw:inline-flex tw:size-[88px] tw:items-center tw:justify-center tw:rounded-[26px] tw:bg-(--surface) tw:text-[32px] tw:font-bold">
                {getInitials(displayName)}
              </span>
            )}
            <h2 className="tw:mt-[18px] tw:text-[22px] tw:wrap-anywhere tw:[font-family:Unbounded,sans-serif]">
              {displayName}
            </h2>
            <p className="tw:mt-[14px] tw:mb-[12px] tw:wrap-anywhere tw:text-(--muted)">
              {email || 'Данные аккаунта загружаются...'}
            </p>
            {username && (
              <span className="tw:text-[14px] tw:text-(--muted)">
                @{username}
              </span>
            )}
          </article>
          <nav
            aria-label="Разделы профиля"
            className={`${panel} tw:grid tw:gap-[8px]`}
          >
            {[
              { id: 'overview', label: 'Профиль' },
              { id: 'active-course', label: 'Активный курс' },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                aria-current={tab === item.id ? 'page' : undefined}
                onClick={() => setTab(item.id)}
                className={`${button} ${tab === item.id ? 'tw:bg-(--surface)' : ''}`}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </aside>
        {tab === 'overview' ? (
          <article className={`${panel} profile-edit-card`}>
            <p className="tw:mt-0 tw:mb-[24px] tw:text-[11px] tw:font-bold tw:uppercase tw:text-(--muted)">
              Данные аккаунта
            </p>
            <div className="tw:mb-[22px] tw:flex tw:items-center tw:justify-between tw:gap-[24px] tw:max-760:flex-wrap">
              <div>
                <h2 className="tw:text-[24px] tw:[font-family:Unbounded,sans-serif]">
                  Профиль пользователя
                </h2>
                <p className="tw:mt-[14px] tw:mb-0 tw:leading-[1.7] tw:text-(--muted)">
                  Эти данные используются в личном кабинете и интерфейсе
                  платформы.
                </p>
              </div>
              {!editing && (
                <button
                  data-help="profile-edit"
                  type="button"
                  className={`${button} tw:shrink-0`}
                  onClick={() => {
                    setEditing(true);
                    setNotice('');
                    setErrors({});
                  }}
                >
                  Редактировать профиль
                </button>
              )}
            </div>
            {!editing ? (
              <dl className="tw:m-0 tw:grid tw:grid-cols-2 tw:gap-[16px] tw:max-760:grid-cols-1">
                {[
                  { label: 'Email', value: email },
                  { label: 'Никнейм', value: username },
                  { label: 'ФИО', value: getDisplayText(user?.full_name) },
                  {
                    label: 'Аватар',
                    value: user?.avatar_url ? 'Загружен' : 'Не загружен',
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="tw:rounded-[12px] tw:border tw:border-solid tw:border-(--line) tw:bg-(--surface) tw:p-[14px]"
                  >
                    <dt className="tw:mb-[14px] tw:text-[11px] tw:font-bold tw:uppercase tw:text-(--muted)">
                      {item.label}
                    </dt>
                    <dd className="tw:m-0 tw:wrap-anywhere tw:font-semibold">
                      {item.value || 'Не указано'}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <form
                onSubmit={(event) => {
                  void save(event);
                }}
                className="tw:grid tw:gap-[20px]"
                noValidate
              >
                <div>
                  <label className="tw:grid tw:gap-[8px] tw:text-[14px]">
                    Аватар
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={selectAvatar}
                      disabled={saving}
                      className="tw:w-full tw:min-w-0 tw:max-w-full tw:text-(--muted)"
                      aria-invalid={Boolean(fieldErrors.avatar)}
                    />
                  </label>
                  <p className="tw:text-[12px] tw:leading-[1.7] tw:text-(--muted)">
                    PNG, JPEG или WebP до 15 МБ.
                  </p>
                  {fieldErrors.avatar && (
                    <p role="alert">{fieldErrors.avatar}</p>
                  )}
                </div>
                <label className="tw:grid tw:gap-[8px] tw:text-[14px]">
                  Email
                  <input
                    type="email"
                    value={email}
                    readOnly
                    className={field}
                  />
                </label>
                {(['username', 'full_name'] as const).map((key) => (
                  <div key={key}>
                    <label className="tw:grid tw:gap-[8px] tw:text-[14px]">
                      {key === 'username' ? 'Никнейм' : 'ФИО'}
                      <input
                        value={form[key]}
                        onChange={(event) => {
                          setForm((value) => ({
                            ...value,
                            [key]: event.target.value,
                          }));
                          setErrors((value) => ({ ...value, [key]: '' }));
                        }}
                        className={field}
                        disabled={saving}
                        aria-invalid={Boolean(fieldErrors[key])}
                      />
                    </label>
                    {fieldErrors[key] && <p role="alert">{fieldErrors[key]}</p>}
                  </div>
                ))}
                <div className="tw:flex tw:flex-wrap tw:gap-[12px]">
                  <button
                    type="submit"
                    disabled={saving}
                    className={`${button} tw:bg-(--contrast)! tw:text-(--text-solid)!`}
                  >
                    {saving ? 'Сохраняем...' : 'Сохранить'}
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    className={button}
                    onClick={cancel}
                  >
                    Отмена
                  </button>
                </div>
              </form>
            )}
            {(notice || sessionError) && (
              <p
                role="status"
                className="tw:mt-[18px] tw:mb-0 tw:leading-[1.7]"
              >
                {notice || sessionError}
              </p>
            )}
          </article>
        ) : (
          <article className={panel}>
            <h2 className="tw:text-[24px] tw:[font-family:Unbounded,sans-serif]">
              Активный курс
            </h2>
            {profileActiveCourse?.id ? (
              <>
                <h3 className="tw:mt-[22px] tw:text-[20px]">
                  {profileActiveCourse.title}
                </h3>
                <p className="tw:text-(--muted)">
                  {profileActiveCourseCompleted} из {profileActiveCourseTotal}{' '}
                  пройдено · {profileActiveCourseProgress}%
                </p>
                <button
                  type="button"
                  className={button}
                  onClick={() => openCourse(profileActiveCourse.id)}
                >
                  Продолжить обучение
                </button>
                <ul className="tw:mt-[20px] tw:grid tw:list-none tw:gap-[10px] tw:p-0">
                  {profileActiveCourse.blocks?.map((block) => (
                    <li key={block.id}>
                      <button
                        type="button"
                        className={`${button} tw:w-full tw:text-left`}
                        onClick={() => openBlock(block.id)}
                      >
                        {block.title}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="tw:mt-[20px] tw:text-(--muted)">
                Откройте курс, чтобы продолжить обучение.
              </p>
            )}
            <Link
              to="/my-courses"
              className="tw:mt-[22px] tw:block tw:text-(--eyebrow)"
            >
              Все мои курсы
            </Link>
          </article>
        )}
      </div>
    </section>
  );
}
