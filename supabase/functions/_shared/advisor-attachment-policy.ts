// Pure, fail-closed policy shared by TOK's AI editor and its regression tests.
// Classification comes from a constrained model response but is never an authorization grant.
export type AdvisorAttachmentCategory =
  | "restaurant_image"
  | "restaurant_business_document"
  | "mixed_restaurant_material"
  | "unsafe_or_irrelevant";

export type AdvisorAttachmentUseDecision = "allowed" | "content_rejected" | "incompatible";

const SAFE_CATEGORIES = new Set<string>([
  "restaurant_image",
  "restaurant_business_document",
  "mixed_restaurant_material",
]);

const TEXT_EDIT_TARGETS = new Set([
  "restaurant",
  "menu_item",
  "ai_profile",
  "restaurant_settings",
]);

export function evaluateAdvisorAttachmentUse(input: {
  attachmentSafe: boolean;
  category: string;
  target: string;
  hasImage: boolean;
  hasPdf: boolean;
}): AdvisorAttachmentUseDecision {
  if (input.attachmentSafe !== true || !SAFE_CATEGORIES.has(input.category)) {
    return "content_rejected";
  }
  if (!input.hasImage && !input.hasPdf) return "incompatible";

  if (input.target === "uploaded_dish_photo") {
    // A photograph of a printed menu or document must NEVER become a dish photo.
    if (!input.hasImage) return "incompatible";
    return input.category === "restaurant_image" || input.category === "mixed_restaurant_material"
      ? "allowed"
      : "incompatible";
  }

  // Photographs of menus can inform bounded text edits, not arbitrary database writes.
  if (!TEXT_EDIT_TARGETS.has(input.target)) return "incompatible";
  if (!input.hasImage && input.category === "restaurant_image") return "incompatible";
  return "allowed";
}
