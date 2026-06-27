import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import SocialComposer from "@/components/social/SocialComposer";

const socialHooks = vi.hoisted(() => ({
  createPost: vi.fn(async () => "post-1"),
  createPremiumBanner: vi.fn(async () => ({
    bannerId: "banner-1",
    audienceCount: 42,
    impressionsPerViewer: 5,
  })),
  recordExternalShare: vi.fn(),
  invoke: vi.fn(),
  invokeSupabaseFunction: vi.fn(),
  from: vi.fn(),
  redirectToTrustedCheckoutUrl: vi.fn(),
}));

vi.mock("@/hooks/useSocialFeed", () => ({
  useCreatePremiumActualitesBanner: () => ({ mutateAsync: socialHooks.createPremiumBanner, isPending: false }),
  useCreateSocialPost: () => ({ mutateAsync: socialHooks.createPost, isPending: false }),
  useRecordExternalShare: () => ({ mutate: socialHooks.recordExternalShare, isPending: false }),
  useRestaurantActualitesPremiumBannerAudience: () => ({
    data: {
      hasAccess: true,
      planSlug: "premium",
      audienceCount: 42,
      impressionsPerViewer: 5,
      activeBannerCount: 0,
    },
    isLoading: false,
  }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  getSupabase: () => ({
    from: socialHooks.from,
    functions: {
      invoke: socialHooks.invoke,
    },
  }),
}));

vi.mock("@/lib/session", () => ({
  invokeSupabaseFunction: socialHooks.invokeSupabaseFunction,
}));

vi.mock("@/lib/securityUrls", async () => {
  const actual = await vi.importActual<typeof import("@/lib/securityUrls")>("@/lib/securityUrls");
  return {
    ...actual,
    redirectToTrustedCheckoutUrl: socialHooks.redirectToTrustedCheckoutUrl,
  };
});

vi.mock("@/lib/checkoutReturnUrl", () => ({
  buildCheckoutReturnUrl: (path: string) => `http://localhost${path}`,
}));

describe("SocialComposer external social publishing", () => {
  beforeEach(() => {
    socialHooks.createPost.mockClear();
    socialHooks.createPremiumBanner.mockClear();
    socialHooks.recordExternalShare.mockClear();
    socialHooks.invoke.mockReset();
    socialHooks.invokeSupabaseFunction.mockReset();
    socialHooks.from.mockReset();
    socialHooks.redirectToTrustedCheckoutUrl.mockReset();
    socialHooks.from.mockImplementation((table: string) => {
      if (table === "restaurants") {
        const chain = {
          select: vi.fn(() => chain),
          not: vi.fn(() => chain),
          limit: vi.fn(async () => ({
            data: [
              { city: "Geneve", cuisine_type: "Italien, Africain" },
              { city: "Lausanne", cuisine_type: "Healthy" },
            ],
            error: null,
          })),
        };
        return chain;
      }
      if (table === "cuisines") {
        const chain = {
          select: vi.fn(() => chain),
          order: vi.fn(() => chain),
          limit: vi.fn(async () => ({
            data: [
              { name: "Italien" },
              { name: "Africain" },
              { name: "Healthy" },
            ],
            error: null,
          })),
        };
        return chain;
      }
      return {
        select: vi.fn(() => ({
          limit: vi.fn(async () => ({ data: [], error: null })),
        })),
      };
    });

    Object.defineProperty(window, "open", {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn(async () => undefined) },
    });
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:tok-social-video"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
  });

  it("replaces canned templates with an AI copy assistant that applies one generated variant", async () => {
    socialHooks.invoke.mockResolvedValue({
      data: {
        variants: [
          {
            title: "Midi efficace",
            body: "Aujourd'hui, notre plat du jour maison est prêt pour un service rapide et gourmand. Commandez maintenant et profitez d'une pause de midi simple, fraîche et généreuse.",
            postType: "plat",
            ctaType: "order",
            campaignGoal: "orders",
            campaignName: "Midi IA",
          },
          {
            title: "Pause gourmande",
            body: "Un plat frais, préparé maison et pensé pour votre pause. Passez commande et laissez notre équipe s'occuper du reste.",
            postType: "plat",
            ctaType: "order",
            campaignGoal: "orders",
            campaignName: "Pause IA",
          },
          {
            title: "Service du jour",
            body: "Le service de midi est lancé avec une préparation maison et des quantités limitées. Réservez votre moment gourmand sur TOK.",
            postType: "annonce",
            ctaType: "menu",
            campaignGoal: "awareness",
            campaignName: "Service IA",
          },
        ],
      },
      error: null,
    });

    render(<SocialComposer restaurantId="restaurant-1" restaurantName="Cafe Test" />);

    expect(screen.queryByRole("button", { name: /Booster midi/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Tables libres/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Améliorer mon texte avec l'IA/i }));
    fireEvent.click(screen.getByRole("radio", { name: /Recevoir plus de commandes/i }));
    fireEvent.click(screen.getByRole("radio", { name: /Service de midi/i }));
    fireEvent.click(screen.getByRole("radio", { name: /Premium et direct/i }));
    fireEvent.click(screen.getByRole("radio", { name: /Clients proches/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Fait maison/i }));
    fireEvent.change(screen.getByLabelText(/Offre, plat ou précision/i), {
      target: { value: "Plat du jour maison" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Générer 3 variantes/i }));

    await waitFor(() => {
      expect(socialHooks.invoke).toHaveBeenCalledWith(
        "ai-social-post-copy",
        expect.objectContaining({
          body: expect.objectContaining({
            restaurantId: "restaurant-1",
            answers: expect.objectContaining({
              objective: "Recevoir plus de commandes",
              offer: "Plat du jour maison",
              strengths: ["Fait maison"],
            }),
          }),
        }),
      );
    });

    await screen.findByText("Midi efficace");
    fireEvent.click(screen.getByText("Midi efficace"));

    expect((screen.getByPlaceholderText(/Quoi de neuf/i) as HTMLTextAreaElement).value).toContain(
      "notre plat du jour maison est prêt",
    );
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

    expect(screen.queryByText(/Partager aussi/i)).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/Quoi de neuf/i), {
      target: { value: "Nouveau menu de saison disponible ce soir." },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Publier$/i }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Publier aussi sur vos réseaux/i })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Instagram/i })).not.toBeChecked();

    fireEvent.click(screen.getByRole("checkbox", { name: /Instagram/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Facebook/i }));
    fireEvent.click(screen.getByRole("button", { name: /Publier et partager/i }));

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

  it("lets restaurateurs attach a video without showing footer metadata", async () => {
    const { container } = render(
      <SocialComposer
        restaurantId="restaurant-1"
        restaurantName="Cafe Test"
      />,
    );
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const video = new File(["video"], "service.mp4", { type: "video/mp4" });

    fireEvent.change(input, { target: { files: [video] } });
    fireEvent.change(screen.getByPlaceholderText(/Quoi de neuf/i), {
      target: { value: "Nouvelle vidéo du service de midi disponible aujourd'hui." },
    });

    expect(screen.queryByText("Vidéo")).not.toBeInTheDocument();
    expect(screen.queryByText("Compression auto")).not.toBeInTheDocument();
    expect(screen.queryByText("Le texte du post est requis.")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^Publier$/i }));

    await waitFor(() => {
      expect(socialHooks.createPost).toHaveBeenCalledWith(
        expect.objectContaining({
          files: [video],
        }),
      );
    });
  });

  it("lets premium restaurateurs activate a five-impression banner for their exact audience", async () => {
    socialHooks.createPost.mockResolvedValueOnce("post-premium-1");

    render(<SocialComposer restaurantId="restaurant-1" restaurantName="Cafe Test" />);

    expect(screen.getByText(/42 personne\(s\) ciblee\(s\).*5 affichages/i)).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/Quoi de neuf/i), {
      target: { value: "Nouvelle offre maison disponible ce soir." },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /Activer la banniere premium/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Publier$/i }));

    await waitFor(() => {
      expect(socialHooks.createPost).toHaveBeenCalledWith(
        expect.objectContaining({
          restaurantId: "restaurant-1",
          body: "Nouvelle offre maison disponible ce soir.",
        }),
      );
    });
    expect(socialHooks.createPremiumBanner).toHaveBeenCalledWith("post-premium-1");
  });

  it("lets restaurateurs sponsor the new post and starts the campaign checkout", async () => {
    socialHooks.createPost.mockResolvedValueOnce("post-boost-1");
    socialHooks.invokeSupabaseFunction.mockImplementation(async (functionName: string) => {
      if (functionName === "create-social-post-boost") {
        return { data: { campaign: { id: "campaign-1" } }, error: null };
      }
      if (functionName === "create-checkout") {
        return { data: { url: "https://checkout.stripe.com/pay/campaign-1" }, error: null };
      }
      return { data: null, error: null };
    });

    render(<SocialComposer restaurantId="restaurant-1" restaurantName="Cafe Test" />);

    fireEvent.change(screen.getByPlaceholderText(/Quoi de neuf/i), {
      target: { value: "Service de midi lance avec un plat du jour maison." },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /Sponsoriser ce post/i }));
    expect(screen.getByRole("heading", { name: /Paramétrer la publication sponsorisée/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: /Conversion/i }));
    fireEvent.click(screen.getByRole("radio", { name: /Nouveaux clients/i }));
    fireEvent.click(await screen.findByRole("checkbox", { name: /Geneve/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Femmes/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Italien/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Fans et clients/i }));
    fireEvent.change(screen.getByLabelText(/Panier moyen minimum/i), { target: { value: "35" } });
    fireEvent.change(screen.getByLabelText(/Activite recente/i), { target: { value: "60" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /Reservation/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Midi/i }));
    fireEvent.change(screen.getByLabelText(/Budget total/i), { target: { value: "40" } });
    fireEvent.change(screen.getByLabelText(/Durée/i), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: /Enregistrer le sponsoring/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Publier$/i }));

    await waitFor(() => {
      expect(socialHooks.createPost).toHaveBeenCalledWith(
        expect.objectContaining({
          restaurantId: "restaurant-1",
          body: "Service de midi lance avec un plat du jour maison.",
        }),
      );
    });

    expect(socialHooks.invokeSupabaseFunction).toHaveBeenCalledWith(
      "create-social-post-boost",
      expect.objectContaining({
        body: expect.objectContaining({
          restaurantId: "restaurant-1",
          postId: "post-boost-1",
          totalBudget: 40,
          durationDays: 5,
          pricingStrategy: "conversion",
          targetCriteria: expect.objectContaining({
            restaurantId: "restaurant-1",
            cities: ["geneve"],
            cuisines: ["italien"],
            genders: ["female"],
            favoritesOnly: true,
            minAvgBasket: 35,
            maxDaysSinceOrder: 60,
          }),
        }),
      }),
    );
    expect(socialHooks.invokeSupabaseFunction).toHaveBeenCalledWith(
      "create-checkout",
      expect.objectContaining({
        body: expect.objectContaining({
          checkout_kind: "campaign",
          order_metadata: expect.objectContaining({
            campaign_id: "campaign-1",
            social_post_id: "post-boost-1",
            target_page: "actualites",
          }),
        }),
      }),
    );
    expect(socialHooks.redirectToTrustedCheckoutUrl).toHaveBeenCalledWith("https://checkout.stripe.com/pay/campaign-1");
  });

  it("lets TOK AI fill every sponsored setting for a new post before checkout", async () => {
    socialHooks.createPost.mockResolvedValueOnce("post-boost-ai-1");
    socialHooks.invokeSupabaseFunction.mockImplementation(async (functionName: string) => {
      if (functionName === "create-social-post-boost") {
        return { data: { campaign: { id: "campaign-ai-1" } }, error: null };
      }
      if (functionName === "create-checkout") {
        return { data: { url: "https://checkout.stripe.com/pay/campaign-ai-1" }, error: null };
      }
      return { data: null, error: null };
    });

    render(<SocialComposer restaurantId="restaurant-1" restaurantName="Quirinale" />);

    fireEvent.change(screen.getByPlaceholderText(/Quoi de neuf/i), {
      target: { value: "Service de midi lance avec un plat du jour maison." },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /Sponsoriser ce post/i }));
    fireEvent.click(screen.getByRole("button", { name: /IA optimise ma publicit/i }));

    expect(screen.getByText(/Plan IA appliqu/i)).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Conversion/i })).toBeChecked();
    expect((screen.getByLabelText(/Budget total/i) as HTMLInputElement).value).toBe("45");
    expect((screen.getByLabelText(/Dur/i) as HTMLInputElement).value).toBe("5");
    expect(screen.getByRole("radio", { name: /Nouveaux clients/i })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Midi/i })).toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: /Enregistrer le sponsoring/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Publier$/i }));

    await waitFor(() => {
      expect(socialHooks.invokeSupabaseFunction).toHaveBeenCalledWith(
        "create-social-post-boost",
        expect.objectContaining({
          body: expect.objectContaining({
            restaurantId: "restaurant-1",
            postId: "post-boost-ai-1",
            totalBudget: 45,
            durationDays: 5,
            pricingStrategy: "conversion",
            targetCriteria: expect.objectContaining({
              cities: [],
              cuisines: [],
              customerSegment: "new",
              genders: ["all"],
              journeyTypes: ["delivery", "takeaway"],
              serviceMoments: ["lunch"],
            }),
          }),
        }),
      );
    });

    expect(socialHooks.redirectToTrustedCheckoutUrl).toHaveBeenCalledWith("https://checkout.stripe.com/pay/campaign-ai-1");
  });
});
