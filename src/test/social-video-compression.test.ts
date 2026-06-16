import { describe, expect, it } from "vitest";

import {
  SOCIAL_VIDEO_MAX_BITS_PER_SECOND,
  SOCIAL_VIDEO_MIN_BITS_PER_SECOND,
  getSocialVideoBitsPerSecond,
  getSocialVideoTargetDimensions,
  getSupportedSocialVideoMimeType,
  isVerticalSocialVideoDimensions,
} from "@/lib/media/socialMediaCompression";

describe("social video compression helpers", () => {
  it("scales landscape and portrait videos to the social feed target frame", () => {
    expect(getSocialVideoTargetDimensions(3840, 2160)).toEqual({ width: 1280, height: 720 });
    expect(getSocialVideoTargetDimensions(1080, 1920)).toEqual({ width: 720, height: 1280 });
    expect(getSocialVideoTargetDimensions(640, 360)).toEqual({ width: 640, height: 360 });
  });

  it("keeps video bitrates bounded for quality and weight control", () => {
    expect(getSocialVideoBitsPerSecond(1280, 720)).toBeGreaterThan(SOCIAL_VIDEO_MIN_BITS_PER_SECOND);
    expect(getSocialVideoBitsPerSecond(7680, 4320)).toBe(SOCIAL_VIDEO_MAX_BITS_PER_SECOND);
    expect(getSocialVideoBitsPerSecond(160, 90)).toBe(SOCIAL_VIDEO_MIN_BITS_PER_SECOND);
  });

  it("falls back cleanly when MediaRecorder is not available", () => {
    expect(getSupportedSocialVideoMimeType()).toBeNull();
  });

  it("detects 9:16 videos for the immersive mobile Actualites card", () => {
    expect(isVerticalSocialVideoDimensions(720, 1280)).toBe(true);
    expect(isVerticalSocialVideoDimensions(1080, 1920)).toBe(true);
    expect(isVerticalSocialVideoDimensions(1280, 720)).toBe(false);
    expect(isVerticalSocialVideoDimensions(1000, 1000)).toBe(false);
  });
});
