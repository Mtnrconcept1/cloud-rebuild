import { act, fireEvent, render, screen } from "@testing-library/react";
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
  beforeEach(() => {
    vi.useFakeTimers();
    window.history.pushState({}, "", "/");
    setViewportWidth(390);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("covers the mobile viewport with the intro video", () => {
    render(<MobileLogoIntro />);

    const overlay = screen.getByTestId("mobile-logo-intro");
    const logoFrame = screen.getByTestId("mobile-logo-intro-logo-frame");
    const video = screen.getByTestId("mobile-logo-intro-video") as HTMLVideoElement;
    const vignette = screen.getByTestId("mobile-logo-intro-vignette");

    expect(overlay).toHaveClass("fixed", "inset-0", "z-[9999]", "bg-black");
    expect(video).toHaveAttribute(
      "src",
      "/higgsfield/tok-logo-intro-mobile.mp4",
    );
    expect(video).toHaveAttribute("poster", "/logo.png");
    expect(video).toHaveAttribute("preload", "auto");
    expect(video.autoplay).toBe(true);
    expect(video.muted).toBe(true);
    expect(video.playsInline).toBe(true);
    expect(screen.queryByTestId("mobile-logo-intro-logo")).not.toBeInTheDocument();
    expect(logoFrame).toHaveClass("relative", "grid", "place-items-center");
    expect(video).toHaveClass("h-full", "w-full", "object-cover");
    expect(vignette.parentElement).toBe(logoFrame);
    expect(vignette).toHaveClass("pointer-events-none", "absolute", "inset-0");
    expect(vignette.getAttribute("style")).toContain("linear-gradient");
  });

  it("does not render on desktop viewports", () => {
    setViewportWidth(1024);

    render(<MobileLogoIntro />);

    expect(screen.queryByTestId("mobile-logo-intro")).not.toBeInTheDocument();
  });

  it("does not render on mobile routes outside the home page", () => {
    window.history.pushState({}, "", "/recherche");

    render(<MobileLogoIntro />);

    expect(screen.queryByTestId("mobile-logo-intro")).not.toBeInTheDocument();
  });

  it("fades out after the logo intro and then removes the blocking overlay", () => {
    render(<MobileLogoIntro />);

    const overlay = screen.getByTestId("mobile-logo-intro");

    act(() => {
      vi.advanceTimersByTime(11000);
    });

    expect(overlay).toHaveClass("opacity-0");

    fireEvent.transitionEnd(overlay);

    expect(screen.queryByTestId("mobile-logo-intro")).not.toBeInTheDocument();
  });

  it("removes the blocking overlay even if the transition end event is not fired", () => {
    render(<MobileLogoIntro />);

    act(() => {
      vi.advanceTimersByTime(11000);
    });

    expect(screen.getByTestId("mobile-logo-intro")).toHaveClass("opacity-0");

    act(() => {
      vi.advanceTimersByTime(800);
    });

    expect(screen.queryByTestId("mobile-logo-intro")).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe("");
  });
});
