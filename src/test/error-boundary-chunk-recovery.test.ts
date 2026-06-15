import { describe, expect, it } from "vitest";
import {
  buildChunkRecoveryUrl,
  isRecoverableChunkLoadError,
} from "@/components/ErrorBoundary";

describe("ErrorBoundary chunk recovery", () => {
  it("detects stale dynamic import failures", () => {
    expect(
      isRecoverableChunkLoadError(
        new Error(
          "Failed to fetch dynamically imported module: https://www.thetok.ch/assets/Actualites-BhKRffVv.js",
        ),
      ),
    ).toBe(true);

    expect(isRecoverableChunkLoadError(new Error("ChunkLoadError: Loading chunk 42 failed."))).toBe(true);
    expect(isRecoverableChunkLoadError(new Error("Unable to preload CSS for /assets/page.css"))).toBe(true);
    expect(isRecoverableChunkLoadError(new Error("Cannot read properties of undefined"))).toBe(false);
  });

  it("builds a cache-busting URL without losing route state", () => {
    expect(buildChunkRecoveryUrl("https://www.thetok.ch/actualites?source=nav#feed", 1781489818)).toBe(
      "https://www.thetok.ch/actualites?source=nav&_tok_refresh=1781489818#feed",
    );
  });
});
