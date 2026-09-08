/* eslint-disable react/prop-types -- this project does not ship prop-types; props stay local to the JSX view. */
import { useEffect, useState } from "react";
import {
  useMemberImagePreview,
} from "../utils/memberImagePreview.js";

const fallbackBaseClass =
  "flex min-h-36 w-full flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-center text-xs text-slate-500";

const MemberDocumentImage = ({
  value,
  alt = "Dokumen anggota",
  apiBase,
  className = "",
  fallbackClassName = "",
  loadingClassName = "",
  showOriginalLink = true,
  ...imgProps
}) => {
  const { previewUrl, originalUrl, isLoading, error } = useMemberImagePreview(value, apiBase);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [previewUrl]);

  if (!originalUrl) {
    return (
      <span className={`${fallbackBaseClass} ${fallbackClassName}`}>
        File belum tersedia
      </span>
    );
  }

  if (isLoading) {
    return (
      <span className={`${fallbackBaseClass} ${loadingClassName}`} role="status">
        <span className="font-semibold text-slate-600">Menyiapkan preview…</span>
        <span className="text-[11px] text-slate-400">File HEIC sedang dibaca di browser</span>
      </span>
    );
  }

  if (error || imageFailed || !previewUrl) {
    return (
      <span className={`${fallbackBaseClass} ${fallbackClassName}`} role="status">
        <span className="font-semibold text-slate-600">Preview tidak tersedia di browser</span>
        {showOriginalLink ? (
          <a
            href={originalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 font-semibold text-blue-600 underline hover:text-blue-800"
          >
            Buka file asli
          </a>
        ) : null}
      </span>
    );
  }

  return (
    <img
      {...imgProps}
      src={previewUrl}
      alt={alt}
      className={className}
      onError={() => setImageFailed(true)}
    />
  );
};

export default MemberDocumentImage;
