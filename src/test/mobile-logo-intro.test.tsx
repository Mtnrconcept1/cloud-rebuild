import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MobileLogoIntro from "@/components/MobileLogoIntro";

describe("optional TOK video", () => {
  beforeEach(() => {
    window.history.pushState({}, "", "/");
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
  });
  it("leaves discovery available without loading or playing media", () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, "play");
    render(<MobileLogoIntro />);
    expect(screen.queryByTestId("mobile-logo-intro-video")).not.toBeInTheDocument();
    expect(play).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Découvrir TOK" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByTestId("mobile-logo-intro")).not.toHaveClass("fixed");
    play.mockRestore();
  });
  it("starts only on request and closes with Escape, returning focus", () => {
    render(<MobileLogoIntro />);
    const trigger = screen.getByRole("button", { name: "Découvrir TOK" });
    fireEvent.click(trigger);
    const video = screen.getByTestId("mobile-logo-intro-video");
    expect(video.querySelector("source")).toHaveAttribute("src", "/higgsfield/tok-intro-mobile.mp4");
    fireEvent.keyDown(video, { key: "Escape" });
    expect(screen.queryByTestId("mobile-logo-intro-video")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
  it("dismisses invitation and omits it away from home", () => {
    const { unmount } = render(<MobileLogoIntro />);
    fireEvent.click(screen.getByRole("button", { name: "Masquer l’invitation vidéo TOK" }));
    expect(screen.queryByTestId("mobile-logo-intro")).not.toBeInTheDocument();
    unmount();
    window.history.pushState({}, "", "/recherche");
    render(<MobileLogoIntro />);
    expect(screen.queryByTestId("mobile-logo-intro")).not.toBeInTheDocument();
  });
  it("uses landscape media on desktop and closes on a media error", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1440 });
    render(<MobileLogoIntro />);
    fireEvent.click(screen.getByRole("button", { name: "Découvrir TOK" }));
    const video = screen.getByTestId("mobile-logo-intro-video");
    expect(video.querySelector("source")).toHaveAttribute("src", "/higgsfield/tok-intro-desktop.mp4");
    fireEvent.error(video);
    expect(screen.queryByTestId("mobile-logo-intro-video")).not.toBeInTheDocument();
  });
});
