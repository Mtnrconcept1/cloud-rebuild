import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import MobileLogoIntro from "@/components/MobileLogoIntro";

function setViewportWidth(width: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: width,
  });
}

describe("MobileLogoIntro", () => {
  const playMock = vi.fn(() => Promise.resolve());

  beforeEach(() => {
    setViewportWidth(390);
    playMock.mockClear();
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value: playMock,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("covers the mobile viewport with the logo animation video without playback controls", () => {
    render(<MobileLogoIntro />);

    const overlay = screen.getByTestId("mobile-logo-intro");
    const videoFrame = screen.getByTestId("mobile-logo-intro-video-frame");
    const video = screen.getByTestId("mobile-logo-intro-video") as HTMLVideoElement;
    const vignette = screen.getByTestId("mobile-logo-intro-vignette");

    expect(overlay).toHaveClass("fixed", "inset-0", "z-[9999]", "bg-black");
    expect(video).toHaveAttribute(
      "src",
      "/higgsfield/intro.mp4",
    );
    expect(video).toHaveAttribute("autoplay");
    expect(videoFrame).toHaveClass("relative", "w-screen", "max-h-dvh", "overflow-hidden");
    expect(video).toHaveClass("block", "w-full", "h-auto", "max-h-dvh", "object-contain");
    expect(video.muted).toBe(true);
    expect(video).toHaveAttribute("playsinline");
    expect(video).not.toHaveAttribute("controls");
    expect(vignette.parentElement).toBe(videoFrame);
    expect(vignette).toHaveClass("pointer-events-none", "absolute", "inset-0");
    expect(vignette.getAttribute("style")).toContain("linear-gradient");
  });

  it("does not render on desktop viewports", () => {
    setViewportWidth(1024);

    render(<MobileLogoIntro />);

    expect(screen.queryByTestId("mobile-logo-intro")).not.toBeInTheDocument();
  });

  it("keeps playing if paused before the animation ends", () => {
    render(<MobileLogoIntro />);

    const video = screen.getByTestId("mobile-logo-intro-video") as HTMLVideoElement;

    fireEvent.pause(video);

    expect(playMock).toHaveBeenCalledTimes(1);
  });

  it("fades out on the last frame and then removes the blocking overlay", async () => {
    render(<MobileLogoIntro />);

    const overlay = screen.getByTestId("mobile-logo-intro");
    const video = screen.getByTestId("mobile-logo-intro-video") as HTMLVideoElement;

    fireEvent.ended(video);

    expect(overlay).toHaveClass("opacity-0");

    fireEvent.transitionEnd(overlay);

    await waitFor(() => {
      expect(screen.queryByTestId("mobile-logo-intro")).not.toBeInTheDocument();
    });
  });
});
