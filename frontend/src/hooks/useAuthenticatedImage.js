import { useEffect, useState } from "react";
import { apiFetch } from "../utils/api";

const failedImageSources = new Set();

function isInlineImageUrl(url) {
  return /^(data:|blob:)/i.test(String(url || ""));
}

function getAuthenticatedImagePath(url) {
  const value = String(url || "").trim();
  if (!value || isInlineImageUrl(value)) return null;

  try {
    const parsed = new URL(value, window.location.origin);
    const isSameBackendHost =
      parsed.hostname === window.location.hostname &&
      parsed.protocol === window.location.protocol;
    if (
      parsed.origin !== window.location.origin &&
      (!isSameBackendHost || !parsed.pathname.startsWith("/api/"))
    ) {
      return null;
    }

    const path = `${parsed.pathname}${parsed.search}`;
    return path.startsWith("/api/v1/") ? path.slice("/api/v1".length) : path;
  } catch {
    return null;
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

    const authenticatedPath = getAuthenticatedImagePath(src);
    if (!authenticatedPath) {
      setImageUrl(src);
      setError(null);
      return undefined;
    }

    if (failedImageSources.has(src)) {
      setImageUrl("");
      setError(new Error("Изображение недоступно."));
      return undefined;
    }

    const controller = new AbortController();
    let objectUrl = "";

    setImageUrl("");
    setError(null);

    apiFetch(authenticatedPath, {
      signal: controller.signal,
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
          failedImageSources.add(src);
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
