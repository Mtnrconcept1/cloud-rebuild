import { describe, expect, it } from "vitest";
import {
  buildChunkRecoveryUrl,
  isRecoverableChunkLoadError,
  recoverChunkLoadError,
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

  it("does not refresh for an unrelated runtime exception", () => {
    expect(recoverChunkLoadError(new Error("Invalid component state"))).toBe(false);
  });

  it("classifies Vite preload failures before the error boundary renders", () => {
    expect(
      isRecoverableChunkLoadError(new TypeError("Failed to fetch dynamically imported module: /assets/chunk-old.js")),
    ).toBe(true);
  });

  it("builds a cache-busting URL without losing route state", () => {
    expect(buildChunkRecoveryUrl("https://www.thetok.ch/actualites?source=nav#feed", 1781489818)).toBe(
      "https://www.thetok.ch/actualites?source=nav&_tok_refresh=1781489818#feed",
    );
  });
});
