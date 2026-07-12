import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSearchText,
  detectImageMime,
  sanitizeTrustedContext,
  validateClaimAgainstImage,
  validateMetadata,
} from "./metadata.js";

function validMetadata(overrides = {}) {
  return {
    description: "Une assiette de pâtes fraîches servie sur une table de restaurant.",
    short_description: "Assiette de pâtes fraîches sur une table.",
    alt_text: "Assiette de pâtes fraîches garnie de tomates et de basilic.",
    seo_title: "Pâtes fraîches au restaurant",
    seo_description: "Une assiette de pâtes fraîches avec tomates et basilic dans un cadre de restaurant convivial.",
    detected_objects: ["assiette", "fourchette"],
    food_items: ["pâtes"],
    ingredients: ["tomates", "basilic"],
    cuisine_types: ["italienne"],
    moods: ["convivial"],
    colors: ["rouge", "vert"],
    hashtags: ["#patesfraiches", "#restaurantgeneve"],
    image_type: "plat",
    is_food_photo: true,
    has_people: false,
    has_logo: false,
    has_text: false,
    quality_score: 8.5,
    ...overrides,
  };
}

test("validates the exact TOK metadata contract", () => {
  const result = validateMetadata(validMetadata());
  assert.equal(result.image_type, "plat");
  assert.equal(result.alt_text.includes("#"), false);
  assert.deepEqual(result.food_items, ["pâtes"]);
});

test("rejects extra keys, hashtags in alt text and sensitive-person inference", () => {
  assert.throws(() => validateMetadata({ ...validMetadata(), extra: true }), /Invalid metadata keys/);
  assert.throws(() => validateMetadata(validMetadata({ alt_text: "Assiette de pâtes #restaurantgeneve posée sur une table." })), /without hashtags/);
  assert.throws(() => validateMetadata(validMetadata({ description: "Une cliente asiatique mange une assiette de pâtes dans le restaurant." })), /sensitive-person inference/);
});

test("keeps internal search terms separate from natural alt text", () => {
  const metadata = validateMetadata(validMetadata());
  const searchText = buildSearchText(metadata, { restaurant_name: "TOK Test", city: "Genève", cuisine_types: ["locale"] });
  assert.match(searchText, /restaurantgeneve/);
  assert.doesNotMatch(searchText, /#restaurantgeneve/);
  assert.doesNotMatch(metadata.alt_text, /restaurantgeneve/);
  assert.match(searchText, /TOK Test/);
});

test("only accepts trusted_context returned by the job RPC", () => {
  assert.equal(sanitizeTrustedContext({ source_context: { city: "Fausse ville" } }), null);
  assert.deepEqual(sanitizeTrustedContext({
    trusted_context: { restaurant_name: "TOK", city: "Genève", cuisine_types: ["Suisse"] },
  }), { restaurant_name: "TOK", city: "Genève", cuisine_types: ["Suisse"] });
});

test("validates the claim against the authoritative restaurant namespace", () => {
  const restaurantId = "22222222-2222-4222-8222-222222222222";
  const postId = "33333333-3333-4333-8333-333333333333";
  const path = `${restaurantId}/${postId}/image.jpg`;
  const job = {
    job_id: "11111111-1111-4111-8111-111111111111",
    image_id: "44444444-4444-4444-8444-444444444444",
    restaurant_id: restaurantId,
    bucket: "social-post-media",
    storage_path: path,
  };
  const image = {
    id: job.image_id,
    restaurant_id: restaurantId,
    bucket: job.bucket,
    storage_path: path,
    source_type: "actualites",
    source_table: "social_posts",
    source_id: postId,
  };
  assert.equal(validateClaimAgainstImage(job, image, new Set(["social-post-media"])), true);
  assert.throws(
    () => validateClaimAgainstImage(job, { ...image, storage_path: `${restaurantId}/other.jpg` }, new Set(["social-post-media"])),
    /storage coordinates/,
  );
  assert.throws(
    () => validateClaimAgainstImage(job, image, new Set(["restaurant-images"])),
    /bucket is not allowed/,
  );
});

test("accepts new gallery paths only under the restaurant namespace", () => {
  const restaurantId = "22222222-2222-4222-8222-222222222222";
  const uploaderId = "55555555-5555-4555-8555-555555555555";
  const path = `${restaurantId}/gallery-image.webp`;
  const job = {
    job_id: "11111111-1111-4111-8111-111111111111",
    image_id: "44444444-4444-4444-8444-444444444444",
    restaurant_id: restaurantId,
    bucket: "restaurant-images",
    storage_path: path,
  };
  const image = {
    id: job.image_id,
    restaurant_id: restaurantId,
    uploaded_by: uploaderId,
    bucket: job.bucket,
    storage_path: path,
    source_type: "restaurant_gallery",
    source_table: null,
    source_id: null,
  };
  assert.equal(validateClaimAgainstImage(job, image, new Set(["restaurant-images"])), true);
  const wrongNamespacePath = `${uploaderId}/gallery-image.webp`;
  assert.throws(
    () => validateClaimAgainstImage(
      { ...job, storage_path: wrongNamespacePath },
      { ...image, storage_path: wrongNamespacePath },
      new Set(["restaurant-images"]),
    ),
    /restaurant namespace/,
  );
});

test("keeps legacy user-namespaced gallery reads opt-in", () => {
  const restaurantId = "22222222-2222-4222-8222-222222222222";
  const uploaderId = "55555555-5555-4555-8555-555555555555";
  const path = `${uploaderId}/legacy-image.jpg`;
  const job = {
    job_id: "11111111-1111-4111-8111-111111111111",
    image_id: "44444444-4444-4444-8444-444444444444",
    restaurant_id: restaurantId,
    bucket: "images",
    storage_path: path,
  };
  const image = {
    id: job.image_id,
    restaurant_id: restaurantId,
    uploaded_by: uploaderId,
    bucket: "images",
    storage_path: path,
    source_type: "restaurant_gallery",
    source_table: null,
    source_id: null,
  };
  assert.throws(() => validateClaimAgainstImage(job, image, new Set(["restaurant-images"])), /bucket is not allowed/);
  assert.equal(validateClaimAgainstImage(job, image, new Set(["restaurant-images", "images"])), true);
});

test("detects image MIME from binary signatures instead of filenames", () => {
  assert.equal(detectImageMime(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])), "image/jpeg");
  assert.equal(detectImageMime(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])), "image/png");
  assert.equal(detectImageMime(Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])), "image/webp");
  assert.equal(detectImageMime(Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])), null);
});
