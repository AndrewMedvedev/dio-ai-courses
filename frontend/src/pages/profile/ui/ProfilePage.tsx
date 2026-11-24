import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { useSessionStore } from '@/entities/session';
import { getMediaUrl, MEDIA_FOLDERS } from '@/shared/lib/media';
import { getErrorMessage } from '@/shared/lib/errors';

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

export function ProfilePage() {
  const user = useSessionStore((state) => state.user);
  const loadCurrentUser = useSessionStore((state) => state.loadCurrentUser);
  const updateProfile = useSessionStore((state) => state.updateProfile);
  const uploadAvatar = useSessionStore((state) => state.uploadAvatar);
  const apiErrors = useSessionStore((state) => state.validationErrors);
  const sessionError = useSessionStore((state) => state.error);
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
  const email = getDisplayText(user?.email);
  const username = getDisplayText(user?.username);
  const fullName = getDisplayText(user?.full_name);
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
    setForm({ username, full_name: fullName });
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
    if (normalized.full_name !== fullName)
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
    'tw:min-w-0 tw:rounded-[24px] tw:border tw:border-solid tw:border-(--line) tw:bg-(--panel-bg) tw:max-480:rounded-[20px]';
  const panelPadding = 'tw:p-[32px] tw:max-760:p-[24px] tw:max-480:p-[16px]';
  const detailRow = 'tw:grid tw:gap-[6px]';
  const detailLabel = 'tw:text-[15px] tw:text-(--muted) tw:max-480:text-[13px]';
  const detailValue =
    'tw:m-0 tw:wrap-anywhere tw:text-[18px] tw:font-semibold tw:text-(--text) tw:max-480:text-[15px]';
  const button =
    'tw:[font-family:inherit] tw:min-h-[50px] tw:rounded-full tw:border tw:border-solid tw:border-(--line-strong) tw:bg-transparent tw:px-[22px] tw:py-[12px] tw:text-(--text) tw:text-[15px] tw:font-semibold tw:cursor-pointer tw:hover:bg-(--surface) tw:focus-visible:outline-2 tw:focus-visible:outline-offset-2 tw:focus-visible:outline-(--cta) tw:disabled:opacity-50 tw:disabled:cursor-wait tw:max-480:min-h-[44px] tw:max-480:px-[12px] tw:max-480:py-[10px] tw:max-480:text-[14px]';
  const primaryButton = `${button} tw:border-transparent! tw:bg-(--contrast)! tw:text-(--text-solid)! tw:hover:brightness-95`;
  const field =
    'tw:box-border tw:w-full tw:rounded-[12px] tw:border tw:border-solid tw:border-(--line) tw:bg-(--surface) tw:p-[16px] tw:text-(--text) tw:[font:inherit] tw:disabled:opacity-60 tw:max-480:p-[14px]';
  const avatar =
    'tw:size-[104px] tw:shrink-0 tw:rounded-[24px] tw:min-1180:size-[128px] tw:max-480:size-[72px] tw:max-480:rounded-[16px]';

  return (
    <section className="profile-view tw:w-full tw:text-(--text)">
      <h1 className="tw:mb-[26px] tw:text-[clamp(1.25rem,3vw,2.5rem)] tw:leading-[1.3] tw:[font-family:Unbounded,sans-serif] tw:max-480:mb-[20px]">
        Профиль
      </h1>
      <div className="profile-layout tw:grid tw:grid-cols-[clamp(300px,34%,440px)_minmax(0,1fr)] tw:items-start tw:gap-[24px] tw:max-980:grid-cols-1 tw:max-480:gap-[18px]">
        <article
          className={`${panel} ${panelPadding} profile-user-card tw:grid tw:justify-items-start tw:gap-[24px] tw:[background:color-mix(in_srgb,var(--panel-bg)_88%,var(--contrast))] tw:max-480:gap-[16px]`}
        >
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt=""
              className={`${avatar} tw:object-cover`}
            />
          ) : (
            <span
              aria-hidden="true"
              className={`${avatar} tw:grid tw:place-items-center tw:bg-(--contrast) tw:text-[38px] tw:font-bold tw:text-(--text-solid) tw:max-480:text-[24px]`}
            >
              {getInitials(fullName || username || email)}
            </span>
          )}
          {!editing && (
            <h2 className="tw:m-0 tw:wrap-anywhere tw:text-[clamp(1.25rem,2.5vw,2rem)] tw:leading-[1.25] tw:text-(--heading)">
              {fullName || (user ? 'Ваш аккаунт' : 'Загружаем профиль…')}
            </h2>
          )}
          <dl className="tw:m-0 tw:grid tw:w-full tw:gap-[18px] tw:border-0 tw:border-t tw:border-solid tw:border-(--line) tw:pt-[20px] tw:max-480:gap-[12px] tw:max-480:pt-[16px]">
            {!editing && (
              <div className={detailRow}>
                <dt className={detailLabel}>Никнейм</dt>
                <dd className={detailValue}>{username || 'Не указан'}</dd>
              </div>
            )}
            <div className={detailRow}>
              <dt className={detailLabel}>Аватар</dt>
              <dd className={detailValue}>
                {user?.avatar_url ? 'Загружен' : 'Не загружен'}
              </dd>
            </div>
          </dl>
          {!editing && (
            <button
              data-help="profile-edit"
              type="button"
              className={`${primaryButton} tw:max-w-full tw:whitespace-normal`}
              onClick={() => {
                setEditing(true);
                setNotice('');
                setErrors({});
              }}
            >
              Редактировать профиль
            </button>
          )}
        </article>
        <article className={`${panel} profile-edit-card`}>
          <header
            className={`${panelPadding} tw:border-0 tw:border-b tw:border-solid tw:border-(--line)`}
          >
            <h2 className="tw:m-0 tw:text-[21px] tw:font-bold tw:leading-[1.4] tw:text-(--heading) tw:max-480:text-[17px]">
              {editing ? 'Редактирование профиля' : 'Личная информация'}
            </h2>
          </header>
          <dl className={`${panelPadding} tw:m-0`}>
            <div className={detailRow}>
              <dt className={detailLabel}>Электронная почта</dt>
              <dd className={detailValue}>{email || 'Не указана'}</dd>
            </div>
          </dl>
          {editing && (
            <form
              onSubmit={(event) => {
                void save(event);
              }}
              className={`${panelPadding} tw:grid tw:gap-[20px] tw:border-0 tw:border-t tw:border-solid tw:border-(--line)`}
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
                    className="tw:peer tw:sr-only"
                    aria-label="Выбрать файл аватара"
                    aria-describedby="profile-avatar-hint"
                    aria-invalid={Boolean(fieldErrors.avatar)}
                  />
                  <span
                    className={`${button} tw:justify-self-start tw:inline-flex tw:max-w-full tw:items-center tw:justify-center tw:whitespace-normal tw:text-center tw:peer-focus-visible:outline-2 tw:peer-focus-visible:outline-offset-2 tw:peer-focus-visible:outline-(--cta) tw:peer-disabled:opacity-50`}
                  >
                    Выбрать файл
                  </span>
                  {avatarFile && (
                    <span className="tw:wrap-anywhere tw:text-(--muted)">
                      {avatarFile.name}
                    </span>
                  )}
                </label>
                <p
                  id="profile-avatar-hint"
                  className="tw:text-[12px] tw:leading-[1.7] tw:text-(--muted)"
                >
                  PNG, JPEG или WebP до 15 МБ.
                </p>
                {fieldErrors.avatar && <p role="alert">{fieldErrors.avatar}</p>}
              </div>
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
                  className={primaryButton}
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
              className="tw:m-0 tw:px-[32px] tw:pb-[20px] tw:leading-[1.7] tw:max-760:px-[24px] tw:max-480:px-[16px]"
            >
              {notice || sessionError}
            </p>
          )}
        </article>
      </div>
    </section>
  );
}
