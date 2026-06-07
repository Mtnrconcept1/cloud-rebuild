import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import SocialComposer from "@/components/social/SocialComposer";

const socialHooks = vi.hoisted(() => ({
  createPost: vi.fn(async () => "post-1"),
  recordExternalShare: vi.fn(),
}));

vi.mock("@/hooks/useSocialFeed", () => ({
  useCreateSocialPost: () => ({ mutateAsync: socialHooks.createPost, isPending: false }),
  useRecordExternalShare: () => ({ mutate: socialHooks.recordExternalShare, isPending: false }),
}));

describe("SocialComposer external social publishing", () => {
  beforeEach(() => {
    socialHooks.createPost.mockClear();
    socialHooks.recordExternalShare.mockClear();

    Object.defineProperty(window, "open", {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn(async () => undefined) },
    });
  });

  it("lets restaurateurs select connected networks and opens them after creating the Tok post", async () => {
    render(
      <SocialComposer
        restaurantId="restaurant-1"
        restaurantName="Cafe Test"
        socialLinks={{
          instagram: "https://www.instagram.com/cafetest",
          facebook: "https://www.facebook.com/cafetest",
          tiktok: "https://www.tiktok.com/@cafetest",
        }}
      />,
    );

    expect(screen.getByText(/Partager aussi/i)).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Instagram/i })).not.toBeChecked();

    fireEvent.click(screen.getByRole("checkbox", { name: /Instagram/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Facebook/i }));
    fireEvent.change(screen.getByPlaceholderText(/Quoi de neuf/i), {
      target: { value: "Nouveau menu de saison disponible ce soir." },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Publier$/i }));

    await waitFor(() => {
      expect(socialHooks.createPost).toHaveBeenCalledWith(
        expect.objectContaining({
          restaurantId: "restaurant-1",
          body: "Nouveau menu de saison disponible ce soir.",
        }),
      );
    });

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining("Nouveau menu de saison disponible ce soir."),
    );
    expect(window.open).toHaveBeenCalledWith("https://www.instagram.com/cafetest", "_blank", "noopener,noreferrer");
    expect(window.open).toHaveBeenCalledWith(
      expect.stringContaining("https://www.facebook.com/sharer/sharer.php?u="),
      "_blank",
      "noopener,noreferrer",
    );
    expect(socialHooks.recordExternalShare).toHaveBeenCalledWith({ postId: "post-1", channel: "instagram" });
    expect(socialHooks.recordExternalShare).toHaveBeenCalledWith({ postId: "post-1", channel: "facebook" });
  });
});
