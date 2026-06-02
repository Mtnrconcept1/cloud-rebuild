export const MAX_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_DOCUMENT_UPLOAD_BYTES = 15 * 1024 * 1024;
export const MAX_SOCIAL_MEDIA_UPLOAD_BYTES = 25 * 1024 * 1024;

export const IMAGE_MIME_EXTENSIONS: Record<string, string> = {
  "image/gif": "gif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export const DOCUMENT_MIME_EXTENSIONS: Record<string, string> = {
  ...IMAGE_MIME_EXTENSIONS,
  "application/pdf": "pdf",
};

export const SOCIAL_MEDIA_MIME_EXTENSIONS: Record<string, string> = {
  ...IMAGE_MIME_EXTENSIONS,
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

const DANGEROUS_EXTENSIONS = new Set([
  "bat",
  "cmd",
  "com",
  "dll",
  "exe",
  "hta",
  "html",
  "js",
  "mjs",
  "php",
  "ps1",
  "scr",
  "sh",
  "svg",
  "vbs",
]);

function extensionFromName(fileName: string) {
  return fileName.includes(".") ? fileName.split(".").pop()?.trim().toLowerCase() || "" : "";
}

export function assertSafeFileUpload(
  file: File,
  options: {
    allowedMimeTypes: Record<string, string>;
    maxBytes: number;
    label: string;
  },
) {
  if (file.size <= 0) {
    throw new Error(`${options.label} vide non autorise.`);
  }

  if (file.size > options.maxBytes) {
    throw new Error(`${options.label} trop volumineux. Limite: ${Math.round(options.maxBytes / 1024 / 1024)} Mo.`);
  }

  if (!options.allowedMimeTypes[file.type]) {
    throw new Error(`${options.label} refuse: format non autorise.`);
  }

  const extension = extensionFromName(file.name);
  if (extension && DANGEROUS_EXTENSIONS.has(extension)) {
    throw new Error(`${options.label} refuse: extension dangereuse.`);
  }
}

export function getSafeUploadExtension(file: File, allowedMimeTypes: Record<string, string>) {
  return allowedMimeTypes[file.type] || "bin";
}
