import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import SocialMediaCarousel from "@/components/social/SocialMediaCarousel";

const videoMedia = [{
  id: "media-1",
  postId: "post-1",
  mediaUrl: "https://example.com/service.webm",
  mediaType: "video",
  sortOrder: 0,
  altText: "Service du jour",
}] as const;

const imageMedia = [{
  id: "media-image-1",
  postId: "post-1",
  mediaUrl: "https://example.supabase.co/storage/v1/object/public/social/posters/tok-logo.jpg",
  mediaType: "image",
  sortOrder: 0,
  altText: "Logo TOK",
}] as const;

type ObserverCallback = IntersectionObserverCallback;

describe("SocialMediaCarousel video autoplay", () => {
  let observerCallback: ObserverCallback | null = null;
  let observedElement: Element | null = null;
  let disconnectMock = vi.fn();
  let playMock: ReturnType<typeof vi.spyOn>;
  let pauseMock: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    observerCallback = null;
    observedElement = null;
    disconnectMock = vi.fn();

    class TestIntersectionObserver {
      readonly root = null;
      readonly rootMargin = "";
      readonly thresholds = [0, 0.2, 0.55, 1];

      constructor(callback: ObserverCallback) {
        observerCallback = callback;
      }

      observe = vi.fn((element: Element) => {
        observedElement = element;
      });

      unobserve = vi.fn();
      disconnect = disconnectMock;
      takeRecords = () => [];
    }

    Object.defineProperty(window, "IntersectionObserver", {
      writable: true,
      configurable: true,
      value: TestIntersectionObserver,
    });
    Object.defineProperty(globalThis, "IntersectionObserver", {
      writable: true,
      configurable: true,
      value: TestIntersectionObserver,
    });

    Object.defineProperty(window, "matchMedia", {
      writable: true,
      configurable: true,
      value: vi.fn(() => ({
        matches: false,
        media: "(prefers-reduced-motion: reduce)",
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    playMock = vi.spyOn(window.HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    pauseMock = vi.spyOn(window.HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
  });

  afterEach(() => {
    playMock.mockRestore();
    pauseMock.mockRestore();
  });

  it("plays videos when they enter the viewport and pauses them when they leave it", () => {
    render(<SocialMediaCarousel media={videoMedia as any} />);

    const video = screen.getByLabelText("Service du jour");
    expect(video).toHaveProperty("muted", true);
    expect(video).toHaveAttribute("data-autoplay-on-view", "true");
    expect(observedElement).toBe(video);

    observerCallback?.([
      { isIntersecting: true, intersectionRatio: 0.75, target: video } as IntersectionObserverEntry,
    ], {} as IntersectionObserver);
    expect(playMock).toHaveBeenCalledTimes(1);

    Object.defineProperty(video, "paused", {
      configurable: true,
      value: false,
    });
    observerCallback?.([
      { isIntersecting: false, intersectionRatio: 0, target: video } as IntersectionObserverEntry,
    ], {} as IntersectionObserver);
    expect(pauseMock).toHaveBeenCalled();
    Object.defineProperty(video, "paused", {
      configurable: true,
      value: true,
    });
  });

  it("hides mobile action overlays while a video is playing and restores them on pause", () => {
    render(
      <SocialMediaCarousel
        media={videoMedia as any}
        mobileOverlay={<button type="button">Sauver</button>}
      />,
    );

    const video = screen.getByLabelText("Service du jour");
    const overlay = screen.getByText("Sauver").closest("[data-media-overlay-state]");
    expect(overlay).toHaveAttribute("data-media-overlay-state", "visible");
    expect(overlay).not.toHaveClass("max-sm:opacity-0");

    fireEvent.play(video);
    expect(overlay).toHaveAttribute("data-media-overlay-state", "hidden-while-playing");
    expect(overlay).toHaveClass("max-sm:pointer-events-none", "max-sm:opacity-0");

    fireEvent.pause(video);
    expect(overlay).toHaveAttribute("data-media-overlay-state", "visible");
    expect(overlay).not.toHaveClass("max-sm:opacity-0");
  });

  it("does not autoplay videos when reduced motion is requested", () => {
    vi.mocked(window.matchMedia).mockReturnValue({
      matches: true,
      media: "(prefers-reduced-motion: reduce)",
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    } as MediaQueryList);

    render(<SocialMediaCarousel media={videoMedia as any} />);

    expect(observerCallback).toBeNull();
    expect(playMock).not.toHaveBeenCalled();
    expect(pauseMock).not.toHaveBeenCalled();
  });

  it("renders images at their original ratio instead of cropping them into the video frame", () => {
    render(<SocialMediaCarousel media={imageMedia as any} variant="side" />);

    const image = screen.getByAltText("Logo TOK");

    expect(image).toHaveClass("h-auto", "w-auto", "max-w-full", "object-contain");
    expect(image).toHaveClass("max-h-[min(70dvh,42rem)]");
    expect(image).not.toHaveClass("w-full");
    expect(image).not.toHaveClass("h-full", "object-cover");
    expect(image.getAttribute("src")).toContain("resize=contain");
    expect(image.getAttribute("src")).not.toContain("height=");
    expect(image.getAttribute("srcset")).toContain("resize=contain");
  });

  it("constrains preview images to the viewport without changing their ratio", () => {
    render(<SocialMediaCarousel media={imageMedia as any} variant="side" constrainedPreview />);

    const image = screen.getByAltText("Logo TOK");

    expect(image).toHaveClass("h-auto", "w-auto", "max-w-full", "object-contain");
    expect(image).toHaveClass("max-h-[min(62dvh,36rem)]");
    expect(image).not.toHaveClass("w-full");
    expect(image.parentElement).toHaveClass("max-h-[min(62dvh,36rem)]");
    expect(image.parentElement).toHaveClass("items-center", "justify-center");
  });
});
