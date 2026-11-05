/** Local-only transports for the browser reel fixture; never contact storage or an AI provider. */
export async function loadTokVideoBrandMedia() {
  return {
    media: [
      { id: "photo-a", media_url: "/__reel_fixture__/photo-a.png", alt_text: "Photo A", media_type: "photo" },
      { id: "photo-b", media_url: "/__reel_fixture__/photo-b.png", alt_text: "Photo B", media_type: "photo" },
      { id: "logo", media_url: "/__reel_fixture__/logo.png", alt_text: "Logo original", media_type: "marketing_logo" },
    ],
    hasMore: false,
  };
}

export const VIDEO_IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";

export async function uploadTokVideoImage(): Promise<never> {
  throw new Error("No remote upload in this fixture");
}
