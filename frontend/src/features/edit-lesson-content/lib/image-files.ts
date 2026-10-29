// Файлы для редактора: base64 для ИИ-редактора и id загруженного изображения.
import { getMediaId } from "@/shared/lib/media";
import type { RawApiRecord } from "@/shared/api";

export function getUserId(
  user: { id?: string; user_id?: string; userId?: string } | null | undefined,
): string {
  return user?.id || user?.user_id || user?.userId || "";
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary);
}

export async function readFileAsBase64(file: File): Promise<string> {
  return arrayBufferToBase64(await file.arrayBuffer());
}

export async function readImageUrlAsBase64(
  url: string | null | undefined,
): Promise<string | null> {
  if (!url) return null;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      "Не удалось прочитать текущее изображение блока для AI-редактора.",
    );
  }
  return arrayBufferToBase64(await response.arrayBuffer());
}

export function getUploadedImageId(
  uploadResult: RawApiRecord | null | undefined,
): string {
  return getMediaId(
    uploadResult?.storage_key ||
      uploadResult?.storageKey ||
      uploadResult?.file_id ||
      uploadResult?.fileId ||
      uploadResult?.image_id ||
      uploadResult?.imageId ||
      uploadResult?.id ||
      uploadResult?.attachment_id,
  );
}
