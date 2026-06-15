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

  it("covers the mobile viewport with the optimized portrait intro video", () => {
    render(<MobileLogoIntro />);

    const overlay = screen.getByTestId("mobile-logo-intro");
    const logoFrame = screen.getByTestId("mobile-logo-intro-logo-frame");
    const video = screen.getByTestId("mobile-logo-intro-video") as HTMLVideoElement;
    const sources = Array.from(video.querySelectorAll("source"));
    const soundToggle = screen.getByTestId("mobile-logo-intro-sound-toggle");
    const vignette = screen.getByTestId("mobile-logo-intro-vignette");

    expect(overlay).toHaveClass("fixed", "inset-0", "z-[9999]", "bg-black");
    expect(overlay).toHaveAttribute("aria-label", "Intro TOK");
    expect(video).toHaveAttribute("poster", "/higgsfield/tok-intro-mobile-poster.webp");
    expect(sources).toHaveLength(1);
    expect(sources[0]).toHaveAttribute("src", "/higgsfield/tok-intro-mobile.mp4");
    expect(sources[0]).toHaveAttribute("type", "video/mp4");
    expect(video).toHaveAttribute("data-intro-variant", "mobile");
    expect(video).toHaveAttribute("width", "1080");
    expect(video).toHaveAttribute("height", "1920");
    expect(video).toHaveAttribute("preload", "auto");
    expect(video.autoplay).toBe(true);
    expect(video.muted).toBe(true);
    expect(video.playsInline).toBe(true);
    expect(soundToggle).toHaveTextContent("Activer le son");
    expect(soundToggle).toHaveAttribute("aria-label", "Activer le son de l'intro TOK");
    expect(screen.queryByTestId("mobile-logo-intro-logo")).not.toBeInTheDocument();
    expect(logoFrame).toHaveClass("relative", "grid", "place-items-center");
    expect(video).toHaveClass("h-full", "w-full", "object-cover");
    expect(vignette.parentElement).toBe(logoFrame);
    expect(vignette).toHaveClass("pointer-events-none", "absolute", "inset-0");
    expect(vignette.getAttribute("style")).toContain("linear-gradient");
  });

  it("covers desktop viewports with the optimized landscape intro video", () => {
    setViewportWidth(1024);

    render(<MobileLogoIntro />);

    const video = screen.getByTestId("mobile-logo-intro-video") as HTMLVideoElement;
    const source = video.querySelector("source");

    expect(screen.getByTestId("mobile-logo-intro")).toBeInTheDocument();
    expect(video).toHaveAttribute("poster", "/higgsfield/tok-intro-desktop-poster.webp");
    expect(source).toHaveAttribute("src", "/higgsfield/tok-intro-desktop.mp4");
    expect(source).toHaveAttribute("type", "video/mp4");
    expect(video).toHaveAttribute("data-intro-variant", "desktop");
    expect(video).toHaveAttribute("width", "1920");
    expect(video).toHaveAttribute("height", "1080");
  });

  it("lets the user activate and cut the intro audio from the overlay", async () => {
    const playSpy = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);

    render(<MobileLogoIntro />);

    const video = screen.getByTestId("mobile-logo-intro-video") as HTMLVideoElement;
    const soundToggle = screen.getByTestId("mobile-logo-intro-sound-toggle");

    expect(video.muted).toBe(true);

    await act(async () => {
      fireEvent.click(soundToggle);
      await Promise.resolve();
    });

    expect(playSpy).toHaveBeenCalledTimes(1);
    expect(video.muted).toBe(false);
    expect(soundToggle).toHaveTextContent("Son activé");
    expect(soundToggle).toHaveAttribute("aria-label", "Couper le son de l'intro TOK");

    await act(async () => {
      fireEvent.click(soundToggle);
    });

    expect(video.muted).toBe(true);
    expect(soundToggle).toHaveTextContent("Activer le son");
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
      vi.advanceTimersByTime(8500);
    });

    expect(overlay).toHaveClass("opacity-0");

    fireEvent.transitionEnd(overlay);

    expect(screen.queryByTestId("mobile-logo-intro")).not.toBeInTheDocument();
  });

  it("removes the blocking overlay even if the transition end event is not fired", () => {
    render(<MobileLogoIntro />);

    act(() => {
      vi.advanceTimersByTime(8500);
    });

    expect(screen.getByTestId("mobile-logo-intro")).toHaveClass("opacity-0");

    act(() => {
      vi.advanceTimersByTime(800);
    });

    expect(screen.queryByTestId("mobile-logo-intro")).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe("");
  });
});
