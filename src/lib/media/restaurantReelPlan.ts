/** A reel is a timeline of the selected originals, never generated scenery. */
export const RESTAURANT_REEL_SECONDS = 10;
export const RESTAURANT_REEL_FPS = 30;
export const RESTAURANT_REEL_WIDTH = 720;
export const RESTAURANT_REEL_HEIGHT = 1280;
export const RESTAURANT_REEL_MAX_PHOTOS = 6;

export type ReelMotion = "none" | "zoom-in" | "zoom-out" | "pan-left" | "pan-right";
export type ReelSettings = {
  motion: ReelMotion;
  transition: "fade" | "cut";
  background: string;
  photoFit: "contain" | "cover";
  logoPosition: "top" | "bottom";
  logoPlate: boolean;
  caption: string;
  font: "serif" | "sans";
};

export const DEFAULT_REEL_SETTINGS: ReelSettings = {
  motion: "none", transition: "fade", background: "#ffffff",
  photoFit: "contain", logoPosition: "top", logoPlate: true, caption: "", font: "sans",
};

export type ReelDraft = {
  version: 1;
  photoIds: string[];
  logoId: string | null;
  withoutLogo: boolean;
  prompt: string;
  appliedPrompt: string;
  settings: ReelSettings;
};

export function normalizeReelSettings(value: unknown): ReelSettings {
  const row = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const motions: ReelMotion[] = ["none", "zoom-in", "zoom-out", "pan-left", "pan-right"];
  return {
    motion: motions.includes(row.motion as ReelMotion) ? row.motion as ReelMotion : "none",
    transition: row.transition === "cut" ? "cut" : "fade",
    background: typeof row.background === "string" && /^#[0-9a-f]{6}$/i.test(row.background)
      ? row.background : DEFAULT_REEL_SETTINGS.background,
    photoFit: row.photoFit === "cover" ? "cover" : "contain",
    logoPosition: row.logoPosition === "bottom" ? "bottom" : "top",
    logoPlate: row.logoPlate !== false,
    // Only the dedicated text field can add text. The prompt is never used as a caption.
    caption: typeof row.caption === "string" ? row.caption.slice(0, 120) : "",
    font: row.font === "serif" ? "serif" : "sans",
  };
}

export function readReelDraft(value: string | null): ReelDraft | null {
  try {
    const row = JSON.parse(value || "null");
    if (!row || row.version !== 1 || !Array.isArray(row.photoIds)) return null;
    return {
      version: 1,
      photoIds: [...new Set<string>(row.photoIds.filter((id: unknown) => typeof id === "string"))]
        .slice(0, RESTAURANT_REEL_MAX_PHOTOS),
      logoId: typeof row.logoId === "string" ? row.logoId : null,
      withoutLogo: row.withoutLogo === true,
      prompt: typeof row.prompt === "string" ? row.prompt.slice(0, 1000) : "",
      appliedPrompt: typeof row.appliedPrompt === "string" ? row.appliedPrompt.slice(0, 1000) : "",
      settings: normalizeReelSettings(row.settings),
    };
  } catch { return null; }
}

/** Deliberately bounded prompt shortcuts. The UI lists exactly what was applied. */
export function applyReelDirection(prompt: string, current: ReelSettings) {
  const text = prompt.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const settings = { ...current };
  const applied: string[] = [];
  if (/(?:sans|pas de|aucun) (?:aucun )?(?:zoom|mouvement|panoramique)|ne pas (?:zoomer|bouger|animer)|(?:plans?|images?|photos?) fixes?|immobiles?/.test(text)) {
    settings.motion = "none"; applied.push("Images fixes");
  } else if (/dezoom|zoom arriere/.test(text)) {
    settings.motion = "zoom-out"; applied.push("Zoom arrière léger");
  } else if (/zoom/.test(text)) {
    settings.motion = "zoom-in"; applied.push("Zoom avant léger");
  } else if (/panoramique.*gauche|vers la gauche/.test(text)) {
    settings.motion = "pan-left"; applied.push("Mouvement vers la gauche");
  } else if (/panoramique.*droite|vers la droite/.test(text)) {
    settings.motion = "pan-right"; applied.push("Mouvement vers la droite");
  }
  if (/(?:sans|pas de|aucun) fondu|coupe[s]? franche[s]?|cuts?\b/.test(text)) {
    settings.transition = "cut"; applied.push("Coupes franches");
  } else if (/fondu|transition[s]? douce[s]?/.test(text)) {
    settings.transition = "fade"; applied.push("Fondus doux");
  }
  if (/sans recadrage|photo[s]? entiere[s]?|image[s]? entiere[s]?/.test(text)) {
    settings.photoFit = "contain"; applied.push("Photos entières");
  } else if (/plein cadre|remplir le cadre/.test(text)) {
    settings.photoFit = "cover"; applied.push("Plein cadre avec recadrage");
  }
  const color = text.match(/fond\s+(#[0-9a-f]{6})\b/);
  if (color) { settings.background = color[1]; applied.push("Couleur de fond " + color[1]); }
  else if (/fond (?:blanc|clair)/.test(text)) { settings.background = "#ffffff"; applied.push("Fond blanc"); }
  else if (/fond (?:noir|sombre)/.test(text)) { settings.background = "#000000"; applied.push("Fond noir"); }
  if (/logo (?:en |tout en )?bas/.test(text)) { settings.logoPosition = "bottom"; applied.push("Logo en bas"); }
  else if (/logo (?:en |tout en )?haut/.test(text)) { settings.logoPosition = "top"; applied.push("Logo en haut"); }
  if (/sans texte|aucun texte/.test(text)) { settings.caption = ""; applied.push("Sans texte"); }
  // A request for a dish/person/scene/audio is never converted into an asset or an API call.
  return { settings, applied };
}

export function reelFrameAt(seconds: number, count: number, transition: ReelSettings["transition"]) {
  if (!Number.isInteger(count) || count < 1 || count > RESTAURANT_REEL_MAX_PHOTOS) {
    throw new Error("Choisissez entre une et six photos.");
  }
  const duration = RESTAURANT_REEL_SECONDS / count;
  const time = Math.max(0, Math.min(RESTAURANT_REEL_SECONDS - 0.000001, Number.isFinite(seconds) ? seconds : 0));
  const index = Math.min(count - 1, Math.floor(time / duration));
  const progress = (time - index * duration) / duration;
  const fadeSeconds = transition === "fade" ? Math.min(0.35, duration / 4) : 0;
  const blend = index < count - 1 && fadeSeconds > 0
    ? Math.max(0, (time - (index + 1) * duration + fadeSeconds) / fadeSeconds) : 0;
  return { index, progress, nextIndex: Math.min(count - 1, index + 1), blend };
}
