import { useEffect, useState } from "react";
import conf from "../conf/conf.js";

const resolveApiBase = (apiBase) =>
  String(apiBase || conf?.server_url || import.meta.env.VITE_API_URL || import.meta.env.VITE_SERVER_URL || "")
    .replace(/\/+$/, "");

export const getMemberImageUrl = (value, apiBase) => {
  if (!value) return "";

  const raw = String(value).trim();
  if (!raw) return "";
  if (raw.startsWith("data:")) return raw;
  if (/^https?:\/\//i.test(raw)) return raw;

  if (raw.startsWith("/uploads/")) {
    const base = resolveApiBase(apiBase);
    return base ? `${base}${raw}` : raw;
  }

  return raw;
};

export const isHeicImageUrl = (value) => {
  const pathname = String(value || "").split(/[?#]/, 1)[0].toLowerCase();
  return /\.(heic|heif)$/.test(pathname);
};

const getInitialPreviewState = (originalUrl) => ({
  previewUrl: isHeicImageUrl(originalUrl) ? "" : originalUrl,
  isLoading: isHeicImageUrl(originalUrl),
  error: null,
});

/**
 * Keeps HEIC conversion in the browser. The original upload URL is never
 * replaced on the server; only a temporary JPEG blob is created for <img>.
 */
export const useMemberImagePreview = (value, apiBase) => {
  const originalUrl = getMemberImageUrl(value, apiBase);
  const isHeic = isHeicImageUrl(originalUrl);
  const [state, setState] = useState(() => getInitialPreviewState(originalUrl));

  useEffect(() => {
    let cancelled = false;
    let objectUrl = null;

    if (!originalUrl || !isHeic) {
      setState({ previewUrl: originalUrl, isLoading: false, error: null });
      return () => {
        cancelled = true;
      };
    }

    setState({ previewUrl: "", isLoading: true, error: null });

    const convertHeic = async () => {
      try {
        const response = await fetch(originalUrl, {
          credentials: "omit",
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const sourceBlob = await response.blob();
        const { default: heic2any } = await import("heic2any");
        const converted = await heic2any({
          blob: sourceBlob,
          toType: "image/jpeg",
          quality: 0.9,
        });
        const convertedBlob = Array.isArray(converted) ? converted[0] : converted;

        if (!(convertedBlob instanceof Blob)) {
          throw new Error("Konversi HEIC tidak menghasilkan gambar");
        }

        objectUrl = URL.createObjectURL(convertedBlob);
        if (cancelled) {
          URL.revokeObjectURL(objectUrl);
          objectUrl = null;
          return;
        }

        setState({ previewUrl: objectUrl, isLoading: false, error: null });
      } catch (error) {
        if (cancelled) return;

        setState({
          previewUrl: "",
          isLoading: false,
          error: error instanceof Error ? error.message : "Preview HEIC gagal diproses",
        });
      }
    };

    convertHeic();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [originalUrl, isHeic]);

  return {
    ...state,
    originalUrl,
    isHeic,
  };
};
