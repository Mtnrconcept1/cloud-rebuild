export const MAX_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_DOCUMENT_UPLOAD_BYTES = 15 * 1024 * 1024;
export const MAX_SOCIAL_MEDIA_UPLOAD_BYTES = 25 * 1024 * 1024;

export const IMAGE_MIME_EXTENSIONS: Record<string, string> = {
  "image/gif": "gif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
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

export const SOCIAL_MEDIA_ACCEPT = Object.keys(SOCIAL_MEDIA_MIME_EXTENSIONS).join(",");

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

const MIME_EXTENSION_ALIASES: Record<string, string[]> = {
  "image/gif": ["gif"],
  "image/jpeg": ["jpg", "jpeg", "jfif", "pjpeg", "pjp"],
  "image/png": ["png"],
  "image/webp": ["webp"],
  "image/heic": ["heic"],
  "image/heif": ["heif"],
  "application/pdf": ["pdf"],
  "video/mp4": ["mp4", "m4v"],
  "video/quicktime": ["mov", "qt"],
  "video/webm": ["webm"],
};

const MAX_SAFE_FILENAME_LENGTH = 180;

function extensionFromName(fileName: string) {
  return fileName.includes(".") ? fileName.split(".").pop()?.trim().toLowerCase() || "" : "";
}

function extensionsFromName(fileName: string) {
  return fileName
    .split(".")
    .slice(1)
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
}

function assertFileName(file: File, label: string) {
  if (!file.name || file.name.length > MAX_SAFE_FILENAME_LENGTH) {
    throw new Error(`${label} refuse: nom de fichier invalide.`);
  }
}

function assertExtensionMatchesMime(
  file: File,
  options: {
    allowedMimeTypes: Record<string, string>;
    label: string;
  },
) {
  const extension = extensionFromName(file.name);
  const extensions = extensionsFromName(file.name);

  if (extensions.some((item) => DANGEROUS_EXTENSIONS.has(item))) {
    throw new Error(`${options.label} refuse: extension dangereuse.`);
  }

  if (!extension) return;

  const expectedExtensions = MIME_EXTENSION_ALIASES[file.type] || [options.allowedMimeTypes[file.type]].filter(Boolean);
  if (expectedExtensions.length > 0 && !expectedExtensions.includes(extension)) {
    throw new Error(`${options.label} refuse: extension incompatible avec le format annonce.`);
  }
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

  assertFileName(file, options.label);
  assertExtensionMatchesMime(file, options);
}

export function getSafeUploadExtension(file: File, allowedMimeTypes: Record<string, string>) {
  return allowedMimeTypes[file.type] || "bin";
}
