import { toText } from '@/shared/lib/text';
export const MEDIA_FOLDERS = Object.freeze({
  AVATAR: 'avatar',
  COURSE_IMAGES: 'course-images',
} as const);

export type MediaFolder = (typeof MEDIA_FOLDERS)[keyof typeof MEDIA_FOLDERS];

export const MEDIA_BASE_URL = String(
  import.meta.env.VITE_MEDIA_BASE_URL ||
    import.meta.env.VITE_STORAGE_PUBLIC_HOST ||
    'http://localhost:9000/ai-course',
).replace(/\/+$/, '');

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function getMediaId(value: unknown): string {
  const source = toText(value || '').trim();
  if (!source) return '';
  if (UUID_RE.test(source)) return source;

  const withoutQuery = source.split(/[?#]/)[0] || '';
  const parts = withoutQuery.split('/').filter(Boolean);
  const [folder, ownerId, filename] = parts.slice(-3);
  if (
    (folder === MEDIA_FOLDERS.AVATAR ||
      folder === MEDIA_FOLDERS.COURSE_IMAGES) &&
    UUID_RE.test(ownerId) &&
    filename &&
    filename !== '.' &&
    filename !== '..'
  ) {
    if (/^https?:\/\//i.test(source)) {
      try {
        const storageName = decodeURIComponent(filename);
        if (
          storageName &&
          !/[/?#]/.test(storageName) &&
          storageName !== '.' &&
          storageName !== '..'
        ) {
          return `${folder}/${ownerId}/${storageName}`;
        }
      } catch {
        return filename;
      }
    } else {
      return `${folder}/${ownerId}/${filename}`;
    }
  }
  return parts.at(-1) || '';
}

export function getMediaUrl(
  userId: unknown,
  folder: unknown,
  imageId: unknown,
): string {
  const normalizedUserId = toText(userId || '').trim();
  const normalizedFolder = toText(folder || '')
    .trim()
    .replace(/^\/+|\/+$/g, '');
  const normalizedImageId = getMediaId(imageId);
  const storagePath = normalizedImageId.split('/');
  if (storagePath.length === 3) {
    return `${MEDIA_BASE_URL}/${storagePath.map(encodeURIComponent).join('/')}`;
  }

  if (!normalizedUserId || !normalizedFolder || !normalizedImageId) return '';

  return `${MEDIA_BASE_URL}/${encodeURIComponent(normalizedFolder)}/${encodeURIComponent(normalizedUserId)}/${encodeURIComponent(normalizedImageId)}`;
}
