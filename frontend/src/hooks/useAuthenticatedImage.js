import { useEffect, useState } from "react";
import { tokenStorage } from "../utils/api";

function isInlineImageUrl(url) {
  return /^(data:|blob:)/i.test(String(url || ""));
}

function shouldRenderDirectly(url) {
  const value = String(url || "").trim();
  if (!value || isInlineImageUrl(value)) {
    return true;
  }

  try {
    const parsed = new URL(value, window.location.origin);
    return parsed.origin !== window.location.origin;
  } catch {
    return false;
  }
}

export function useAuthenticatedImage(src, { enabled = true } = {}) {
  const [imageUrl, setImageUrl] = useState("");
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!enabled || !src) {
      setImageUrl("");
      setError(null);
      return undefined;
    }

    if (shouldRenderDirectly(src)) {
      setImageUrl(src);
      setError(null);
      return undefined;
    }

    const token = tokenStorage.getAccessToken();
    if (!token) {
      setImageUrl("");
      setError(null);
      return undefined;
    }

    const controller = new AbortController();
    let objectUrl = "";

    setImageUrl("");
    setError(null);

    fetch(src, {
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(
            `Не удалось загрузить изображение: ${response.status}`,
          );
        }
        return response.blob();
      })
      .then((blob) => {
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setImageUrl(objectUrl);
      })
      .catch((loadError) => {
        if (!controller.signal.aborted) {
          setError(loadError);
          setImageUrl("");
        }
      });

    return () => {
      controller.abort();
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [enabled, src]);

  return {
    imageUrl,
    error,
    isLoading: Boolean(enabled && src && !imageUrl && !error),
  };
}
