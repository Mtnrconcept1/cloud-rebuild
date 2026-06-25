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
    window.sessionStorage.clear();
    document.body.style.overflow = "";
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  });

  afterEach(() => {
    window.sessionStorage.clear();
    document.body.style.overflow = "";
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("plays the portrait intro video in a blocking layer until media ends", () => {
    render(<MobileLogoIntro />);

    const overlay = screen.getByTestId("mobile-logo-intro");
    const logoFrame = screen.getByTestId("mobile-logo-intro-logo-frame");
    const video = screen.getByTestId("mobile-logo-intro-video") as HTMLVideoElement;
    const sources = Array.from(video.querySelectorAll("source"));
    const soundToggle = screen.getByTestId("mobile-logo-intro-sound-toggle");
    const skipButton = screen.getByTestId("mobile-logo-intro-skip");
    const vignette = screen.getByTestId("mobile-logo-intro-vignette");

    expect(overlay).toHaveClass("pointer-events-auto", "fixed", "inset-0", "z-[9999]", "bg-black");
    expect(overlay).toHaveAttribute("aria-label", "Intro TOK");
    expect(overlay).toHaveStyle({ transitionDuration: "220ms" });
    expect(document.body.style.overflow).toBe("");
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
    expect(skipButton).toHaveTextContent("Passer");
    expect(skipButton).toHaveClass("pointer-events-auto");
    expect(soundToggle).toHaveTextContent("Activer le son");
    expect(soundToggle).toHaveAttribute("aria-label", "Activer le son de l'intro TOK");
    expect(soundToggle).toHaveClass("pointer-events-auto");
    expect(screen.queryByTestId("mobile-logo-intro-logo")).not.toBeInTheDocument();
    expect(logoFrame).toHaveClass("relative", "grid", "place-items-center");
    expect(video).toHaveClass("h-full", "w-full", "object-cover");
    expect(vignette.parentElement).toBe(logoFrame);
    expect(vignette).toHaveClass("pointer-events-none", "absolute", "inset-0");
    expect(vignette.getAttribute("style")).toContain("linear-gradient");
  });

  it("plays desktop viewports with the optimized landscape intro video", () => {
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
    expect(video).toHaveAttribute("preload", "auto");
    expect(video.muted).toBe(true);
  });

  it("starts muted and lets the user explicitly enable sound", async () => {
    render(<MobileLogoIntro />);

    const video = screen.getByTestId("mobile-logo-intro-video") as HTMLVideoElement;
    const soundToggle = screen.getByTestId("mobile-logo-intro-sound-toggle");

    await act(async () => {
      await Promise.resolve();
    });

    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
    expect(video.muted).toBe(true);
    expect(video.volume).toBe(0);
    expect(soundToggle).toHaveTextContent("Activer le son");

    await act(async () => {
      fireEvent.click(soundToggle);
    });

    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2);
    expect(video.muted).toBe(false);
    expect(video.volume).toBe(1);
    expect(soundToggle).toHaveTextContent("Son activé");
  });

  it.each([
    "/recherche",
    "/panier",
    "/auth",
    "/commande/123",
    "/dashboard",
    "/admin",
    "/courier",
  ])("does not render on operational route %s", (route) => {
    window.history.pushState({}, "", route);

    render(<MobileLogoIntro />);

    expect(screen.queryByTestId("mobile-logo-intro")).not.toBeInTheDocument();
  });

  it("waits for the video end before fading out and remembers the intro for the session", () => {
    const { unmount } = render(<MobileLogoIntro />);

    const overlay = screen.getByTestId("mobile-logo-intro");
    const video = screen.getByTestId("mobile-logo-intro-video") as HTMLVideoElement;

    act(() => {
      vi.advanceTimersByTime(650);
    });

    expect(overlay).toHaveClass("opacity-100");

    fireEvent.ended(video);

    expect(overlay).toHaveClass("opacity-0");

    fireEvent.transitionEnd(overlay);

    expect(screen.queryByTestId("mobile-logo-intro")).not.toBeInTheDocument();

    unmount();
    render(<MobileLogoIntro />);

    expect(screen.queryByTestId("mobile-logo-intro")).not.toBeInTheDocument();
  });

  it("can be skipped immediately", () => {
    render(<MobileLogoIntro />);

    const overlay = screen.getByTestId("mobile-logo-intro");
    const skipButton = screen.getByTestId("mobile-logo-intro-skip");

    fireEvent.click(skipButton);

    expect(overlay).toHaveClass("opacity-0");

    fireEvent.transitionEnd(overlay);

    expect(screen.queryByTestId("mobile-logo-intro")).not.toBeInTheDocument();
  });

  it("removes the lightweight overlay even if the transition end event is not fired", () => {
    render(<MobileLogoIntro />);

    const video = screen.getByTestId("mobile-logo-intro-video") as HTMLVideoElement;

    fireEvent.ended(video);

    expect(screen.getByTestId("mobile-logo-intro")).toHaveClass("opacity-0");

    act(() => {
      vi.advanceTimersByTime(340);
    });

    expect(screen.queryByTestId("mobile-logo-intro")).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe("");
  });
});
