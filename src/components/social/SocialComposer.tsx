import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { CalendarClock, Crown, Facebook, ImagePlus, Instagram, Loader2, Megaphone, Music2, Plus, Send, Share2, Sparkles, Video, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  useCreatePremiumActualitesBanner,
  useCreateSocialPost,
  useRecordExternalShare,
  useRestaurantActualitesPremiumBannerAudience,
} from "@/hooks/useSocialFeed";
import { getSupabase } from "@/integrations/supabase/client";
import {
  CUSTOMER_SEGMENT_OPTIONS,
  GENDER_TARGET_OPTIONS,
  JOURNEY_TYPE_OPTIONS,
  SERVICE_MOMENT_OPTIONS,
  DEFAULT_AUDIENCE_CRITERIA,
  normalizeAudienceCriteria,
  type CampaignCustomerSegment,
  type CampaignGenderTarget,
  type CampaignJourneyType,
  type CampaignServiceMoment,
} from "@/lib/campaignTargeting";
import {
  CAMPAIGN_STRATEGY_CONFIG,
  estimateCampaignPlan,
  getCampaignPricing,
  type CampaignPricingStrategy,
} from "@/lib/campaignPricing";
import { buildCheckoutReturnUrl } from "@/lib/checkoutReturnUrl";
import { redirectToTrustedCheckoutUrl } from "@/lib/securityUrls";
import { invokeSupabaseFunction } from "@/lib/session";
import {
  getSocialPostShareUrl,
  getVisibilityForAudienceSegment,
  validateSocialPostDraft,
  type SocialAudienceSegment,
  type SocialMarketingGoal,
  type SocialPostCtaType,
  type SocialPostType,
} from "@/lib/socialFeed";
import {
  SOCIAL_CROSS_POST_LABELS,
  buildSocialCrossPostActions,
  getAvailableSocialCrossPostPlatforms,
  type RestaurantSocialLinks,
  type SocialCrossPostPlatform,
} from "@/lib/socialCrossPosting";
import { SOCIAL_MEDIA_ACCEPT, assertSafeSocialMediaSourceFileUpload } from "@/lib/uploadSecurity";
import { cn } from "@/lib/utils";

const SPONSOR_TARGET_OPTIONS_LIMIT = 120;

const SOCIAL_CROSS_POST_ICONS: Record<SocialCrossPostPlatform, ComponentType<{ className?: string }>> = {
  instagram: Instagram,
  facebook: Facebook,
  tiktok: Music2,
};

type AiCopyAnswers = {
  objective: string;
  moment: string;
  offer: string;
  tone: string;
  audience: string;
  strengths: string[];
};

type AiCopyVariant = {
  title: string;
  body: string;
  postType: SocialPostType;
  ctaType: SocialPostCtaType;
  campaignGoal: SocialMarketingGoal;
  campaignName: string;
};

const AI_COPY_INITIAL_ANSWERS: AiCopyAnswers = {
  objective: "",
  moment: "",
  offer: "",
  tone: "",
  audience: "",
  strengths: [],
};

const AI_COPY_QUESTIONS = [
  {
    key: "objective",
    title: "Quel est l'objectif du post ?",
    options: [
      "Recevoir plus de commandes",
      "Remplir des tables",
      "Montrer les coulisses",
      "Mettre en avant une offre",
    ],
  },
  {
    key: "moment",
    title: "Quel moment faut-il pousser ?",
    options: [
      "Service de midi",
      "Service du soir",
      "Ce week-end",
      "Aujourd'hui uniquement",
    ],
  },
  {
    key: "tone",
    title: "Quel ton souhaitez-vous ?",
    options: [
      "Premium et direct",
      "Chaleureux et familial",
      "Urgent et commercial",
      "Gourmand et descriptif",
    ],
  },
  {
    key: "audience",
    title: "Qui voulez-vous toucher ?",
    options: [
      "Clients proches",
      "Clients fideles",
      "Nouveaux clients",
      "Abonnes du restaurant",
    ],
  },
] as const;

const AI_COPY_STRENGTHS = [
  "Produit frais",
  "Fait maison",
  "Quantites limitees",
  "Service rapide",
  "Ambiance conviviale",
  "Equipe en cuisine",
];

const SPONSOR_OBJECTIVES: CampaignPricingStrategy[] = ["visibility", "traffic", "conversion"];

async function copySocialCrossPostText(text: string) {
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) return false;

  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function openSocialCrossPostUrl(url: string) {
  if (typeof window === "undefined") return;
  window.open(url, "_blank", "noopener,noreferrer");
}

function getMinimumScheduledAtInputValue() {
  const minimum = new Date(Date.now() + 5 * 60_000);
  const local = new Date(minimum.getTime() - minimum.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function getCurrentDateInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function compactCampaignText(value: string, maxLength = 220) {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > maxLength ? `${clean.slice(0, maxLength - 1)}…` : clean;
}

function formatChf(value: number, digits = 2) {
  return `${Number(value || 0).toFixed(digits)} CHF`;
}

export default function SocialComposer({
  restaurantId,
  restaurantName,
  socialLinks,
  sponsorDialogRequest = 0,
  compact = false,
}: {
  restaurantId: string | null;
  restaurantName?: string | null;
  socialLinks?: RestaurantSocialLinks | null;
  sponsorDialogRequest?: number;
  compact?: boolean;
}) {
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [postType, setPostType] = useState<SocialPostType>("annonce");
  const [ctaType, setCtaType] = useState<SocialPostCtaType>("none");
  const [campaignGoal, setCampaignGoal] = useState<SocialMarketingGoal>("awareness");
  const [audienceSegment, setAudienceSegment] = useState<SocialAudienceSegment>("local");
  const [campaignName, setCampaignName] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Array<{ file: File; url: string }>>([]);
  const [selectedCrossPostPlatforms, setSelectedCrossPostPlatforms] = useState<SocialCrossPostPlatform[]>([]);
  const [crossPostDialogOpen, setCrossPostDialogOpen] = useState(false);
  const [aiCopyOpen, setAiCopyOpen] = useState(false);
  const [aiCopyAnswers, setAiCopyAnswers] = useState<AiCopyAnswers>(AI_COPY_INITIAL_ANSWERS);
  const [aiCopyVariants, setAiCopyVariants] = useState<AiCopyVariant[]>([]);
  const [aiCopyLoading, setAiCopyLoading] = useState(false);
  const [aiCopyError, setAiCopyError] = useState<string | null>(null);
  const [sponsorPost, setSponsorPost] = useState(false);
  const [premiumBannerPost, setPremiumBannerPost] = useState(false);
  const [sponsorDialogOpen, setSponsorDialogOpen] = useState(false);
  const [sponsorBudget, setSponsorBudget] = useState("25");
  const [sponsorDurationDays, setSponsorDurationDays] = useState(7);
  const [sponsorStrategy, setSponsorStrategy] = useState<CampaignPricingStrategy>("traffic");
  const [sponsorCustomerSegment, setSponsorCustomerSegment] = useState<CampaignCustomerSegment>("all");
  const [sponsorGenders, setSponsorGenders] = useState<CampaignGenderTarget[]>(["all"]);
  const [sponsorCities, setSponsorCities] = useState<string[]>([]);
  const [sponsorCuisines, setSponsorCuisines] = useState<string[]>([]);
  const [sponsorFavoritesOnly, setSponsorFavoritesOnly] = useState(false);
  const [sponsorMinAvgBasket, setSponsorMinAvgBasket] = useState("");
  const [sponsorMaxDaysSinceOrder, setSponsorMaxDaysSinceOrder] = useState(365);
  const [sponsorJourneyTypes, setSponsorJourneyTypes] = useState<CampaignJourneyType[]>(["delivery", "takeaway"]);
  const [sponsorServiceMoments, setSponsorServiceMoments] = useState<CampaignServiceMoment[]>([]);
  const [sponsorCityOptions, setSponsorCityOptions] = useState<string[]>([]);
  const [sponsorCuisineOptions, setSponsorCuisineOptions] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const createPost = useCreateSocialPost();
  const createPremiumBanner = useCreatePremiumActualitesBanner();
  const premiumBannerAudience = useRestaurantActualitesPremiumBannerAudience(restaurantId);
  const recordExternalShare = useRecordExternalShare();
  const minimumScheduledAt = useMemo(() => getMinimumScheduledAtInputValue(), []);
  const availableCrossPostPlatforms = useMemo(
    () => getAvailableSocialCrossPostPlatforms(socialLinks),
    [socialLinks],
  );
  const canCrossPostNow = availableCrossPostPlatforms.length > 0 && !scheduledAt;
  const sponsorBudgetValue = Math.max(0, Number(sponsorBudget) || 0);
  const sponsorPricing = useMemo(() => getCampaignPricing(undefined, sponsorStrategy), [sponsorStrategy]);
  const sponsorEstimate = useMemo(
    () => estimateCampaignPlan({
      totalBudgetChf: sponsorBudgetValue,
      durationDays: sponsorDurationDays,
      strategy: sponsorStrategy,
      pricing: sponsorPricing,
    }),
    [sponsorBudgetValue, sponsorDurationDays, sponsorPricing, sponsorStrategy],
  );
  const canCreateSponsoredCheckout = sponsorPost && !scheduledAt && sponsorBudgetValue > 0;
  const sponsorObjectiveLabel = CAMPAIGN_STRATEGY_CONFIG[sponsorStrategy].shortLabel;
  const premiumAudience = premiumBannerAudience.data || {
    hasAccess: false,
    planSlug: null,
    audienceCount: 0,
    impressionsPerViewer: 5,
    activeBannerCount: 0,
  };
  const hasPremiumBannerAccess = Boolean(premiumAudience.hasAccess);
  const premiumAudienceCount = Number(premiumAudience.audienceCount || 0);
  const premiumImpressionsPerViewer = Number(premiumAudience.impressionsPerViewer || 5);
  const canCreatePremiumBanner = premiumBannerPost && !scheduledAt && hasPremiumBannerAccess;

  useEffect(() => {
    const nextPreviews = files.slice(0, 10).map((file) => ({ file, url: URL.createObjectURL(file) }));
    setPreviews(nextPreviews);
    return () => {
      nextPreviews.forEach((preview) => URL.revokeObjectURL(preview.url));
    };
  }, [files]);

  useEffect(() => {
    if (sponsorDialogRequest <= 0 || scheduledAt) return;
    setSponsorPost(true);
    setSponsorDialogOpen(true);
  }, [scheduledAt, sponsorDialogRequest]);

  useEffect(() => {
    if (scheduledAt && premiumBannerPost) {
      setPremiumBannerPost(false);
    }
  }, [premiumBannerPost, scheduledAt]);

  useEffect(() => {
    setSelectedCrossPostPlatforms((current) =>
      current.filter((platform) => availableCrossPostPlatforms.includes(platform)),
    );
  }, [availableCrossPostPlatforms]);

  useEffect(() => {
    let cancelled = false;

    const loadSponsorTargetOptions = async () => {
      try {
        const supabase = getSupabase();
        if (typeof (supabase as any).from !== "function") return;

        const [restaurantsResult, cuisinesResult] = await Promise.all([
          supabase
            .from("restaurants" as any)
            .select("city,cuisine_type")
            .not("city", "is", null)
            .limit(SPONSOR_TARGET_OPTIONS_LIMIT),
          supabase
            .from("cuisines" as any)
            .select("name")
            .order("name", { ascending: true })
            .limit(SPONSOR_TARGET_OPTIONS_LIMIT),
        ]);

        if (cancelled) return;

        const restaurantRows = Array.isArray(restaurantsResult.data) ? restaurantsResult.data : [];
        const cuisineRows = Array.isArray(cuisinesResult.data) ? cuisinesResult.data : [];
        const cities = Array.from(new Set(
          restaurantRows
            .map((row: any) => String(row?.city || "").trim())
            .filter(Boolean),
        )).sort((a, b) => a.localeCompare(b, "fr-CH"));
        const cuisines = Array.from(new Set([
          ...cuisineRows.map((row: any) => String(row?.name || "").trim()).filter(Boolean),
          ...restaurantRows
            .flatMap((row: any) => String(row?.cuisine_type || "").split(","))
            .map((value: string) => value.trim())
            .filter(Boolean),
        ])).sort((a, b) => a.localeCompare(b, "fr-CH"));

        setSponsorCityOptions(cities);
        setSponsorCuisineOptions(cuisines);
      } catch {
        if (!cancelled) {
          setSponsorCityOptions([]);
          setSponsorCuisineOptions([]);
        }
      }
    };

    void loadSponsorTargetOptions();

    return () => {
      cancelled = true;
    };
  }, []);

  const validationErrors = useMemo(
    () =>
      validateSocialPostDraft({
        body,
        filesCount: files.length,
        postType,
        ctaType,
        scheduledAt: scheduledAt || null,
      }),
    [body, ctaType, files.length, postType, scheduledAt],
  );
  const canSubmit = Boolean(
    restaurantId &&
    body.trim() &&
    validationErrors.length === 0 &&
    !fileError &&
    !createPost.isPending &&
    !createPremiumBanner.isPending,
  );
  const mediaLabel = files.length === 0 ? "Média" : `${files.length}/10`;
  const utmCampaign = useMemo(() => {
    const source = campaignName.trim() || `${campaignGoal}-${restaurantName || "tok"}`;
    return source
      .toLocaleLowerCase("fr-CH")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 80);
  }, [campaignGoal, campaignName, restaurantName]);
  const canGenerateAiCopy = Boolean(
    restaurantId &&
    aiCopyAnswers.objective &&
    aiCopyAnswers.moment &&
    aiCopyAnswers.tone &&
    aiCopyAnswers.audience &&
    !aiCopyLoading,
  );

  const setAiCopyAnswer = (key: keyof AiCopyAnswers, value: string) => {
    setAiCopyAnswers((current) => ({ ...current, [key]: value }));
  };

  const toggleAiCopyStrength = (value: string, checked: boolean) => {
    setAiCopyAnswers((current) => {
      const strengths = checked
        ? Array.from(new Set([...current.strengths, value]))
        : current.strengths.filter((item) => item !== value);
      return { ...current, strengths };
    });
  };

  const toggleSponsorJourneyType = (value: CampaignJourneyType, checked: boolean) => {
    setSponsorJourneyTypes((current) => {
      if (checked) return current.includes(value) ? current : [...current, value];
      return current.filter((item) => item !== value);
    });
  };

  const toggleSponsorServiceMoment = (value: CampaignServiceMoment, checked: boolean) => {
    setSponsorServiceMoments((current) => {
      if (checked) return current.includes(value) ? current : [...current, value];
      return current.filter((item) => item !== value);
    });
  };

  const toggleSponsorCity = (value: string, checked: boolean) => {
    setSponsorCities((current) => {
      if (checked) return current.includes(value) ? current : [...current, value];
      return current.filter((item) => item !== value);
    });
  };

  const toggleSponsorCuisine = (value: string, checked: boolean) => {
    setSponsorCuisines((current) => {
      if (checked) return current.includes(value) ? current : [...current, value];
      return current.filter((item) => item !== value);
    });
  };

  const toggleSponsorGender = (value: CampaignGenderTarget, checked: boolean) => {
    setSponsorGenders((current) => {
      if (value === "all") return ["all"];
      const withoutAll = current.filter((item) => item !== "all");
      const next = checked
        ? Array.from(new Set([...withoutAll, value]))
        : withoutAll.filter((item) => item !== value);
      return next.length > 0 ? next : ["all"];
    });
  };

  const generateAiCopy = async () => {
    if (!restaurantId || !canGenerateAiCopy) return;
    setAiCopyLoading(true);
    setAiCopyError(null);

    try {
      const { data, error } = await getSupabase().functions.invoke<{ variants: AiCopyVariant[] }>("ai-social-post-copy", {
        body: {
          restaurantId,
          currentText: body,
          answers: aiCopyAnswers,
        },
      });

      if (error) throw error;
      const variants = Array.isArray(data?.variants) ? data.variants.slice(0, 3) : [];
      if (variants.length !== 3) throw new Error("Réponse IA incomplète.");
      setAiCopyVariants(variants);
    } catch (error) {
      setAiCopyError((error as Error).message || "L'assistant IA est indisponible pour le moment.");
    } finally {
      setAiCopyLoading(false);
    }
  };

  const applyAiCopyVariant = (variant: AiCopyVariant) => {
    setBody(variant.body);
    setPostType(variant.postType);
    setCtaType(variant.ctaType);
    setCampaignGoal(variant.campaignGoal);
    setCampaignName(variant.campaignName || variant.title);
    setAiCopyOpen(false);
  };

  const createSponsoredCheckout = async (postId: string, postBody: string) => {
    if (!restaurantId || !canCreateSponsoredCheckout) return false;

    const targetCriteria = normalizeAudienceCriteria({
      ...DEFAULT_AUDIENCE_CRITERIA,
      cities: sponsorCities,
      cuisines: sponsorCuisines,
      genders: sponsorGenders,
      favoritesOnly: sponsorFavoritesOnly,
      minAvgBasket: Number(sponsorMinAvgBasket) || 0,
      maxDaysSinceOrder: sponsorMaxDaysSinceOrder,
      customerSegment: sponsorCustomerSegment,
      journeyTypes: sponsorJourneyTypes,
      serviceMoments: sponsorServiceMoments,
      restaurantId,
    });

    const title = `Boost Actualités - ${restaurantName || "restaurant"}`;
    const { data, error } = await invokeSupabaseFunction<{ campaign?: { id?: string } }>("create-social-post-boost", {
      body: {
        restaurantId,
        postId,
        title,
        body: compactCampaignText(postBody),
        imageUrl: null,
        totalBudget: sponsorBudgetValue,
        durationDays: sponsorDurationDays,
        startsAt: getCurrentDateInputValue(),
        pricingStrategy: sponsorStrategy,
        targetCriteria,
      },
    });

    if (error) throw error;
    const campaignId = data?.campaign?.id;
    if (!campaignId) throw new Error("Impossible de créer la mise en avant.");

    const checkout = await invokeSupabaseFunction<{ url?: string }>("create-checkout", {
      body: {
        checkout_kind: "campaign",
        items: [
          {
            name: `Post sponsorisé Actualités - ${restaurantName || "restaurant"}`,
            restaurant_name: restaurantName || "Restaurant",
            price: sponsorBudgetValue,
            quantity: 1,
          },
        ],
        payment_method: "card",
        return_url: buildCheckoutReturnUrl(`/dashboard/actualites?campaign_checkout=1&campaign_id=${campaignId}&post_id=${postId}`),
        order_metadata: {
          checkout_kind: "campaign",
          order_reference: `social-post-campaign-${campaignId}`,
          campaign_id: campaignId,
          social_post_id: postId,
          campaign_title: title,
          restaurant_id: restaurantId,
          target_page: "actualites",
          disable_connected_account: true,
        },
      },
    });

    if (checkout.error || !checkout.data?.url) {
      throw new Error(checkout.error?.message || "Impossible de créer la session de paiement.");
    }

    redirectToTrustedCheckoutUrl(checkout.data.url);
    return true;
  };

  const submit = async (crossPostPlatformsOverride?: SocialCrossPostPlatform[]) => {
    if (!restaurantId || !canSubmit) return;
    const scheduledIso = scheduledAt ? new Date(scheduledAt).toISOString() : null;
    const crossPostPlatforms = scheduledIso ? [] : crossPostPlatformsOverride ?? selectedCrossPostPlatforms;
    const postBody = body;

    const postId = await createPost.mutateAsync({
      restaurantId,
      body: postBody,
      files,
      postType,
      ctaType,
      scheduledAt: scheduledIso,
      visibility: getVisibilityForAudienceSegment(audienceSegment),
      campaignGoal,
      campaignName: campaignName || null,
      audienceSegment,
      offerCode: null,
      utmCampaign,
    });

    const crossPostActions = buildSocialCrossPostActions({
      body,
      postUrl: getSocialPostShareUrl(postId),
      selectedPlatforms: crossPostPlatforms,
      socialLinks,
    });

    if (crossPostActions.length > 0) {
      await copySocialCrossPostText(crossPostActions[0].clipboardText);
      crossPostActions.forEach((action) => {
        openSocialCrossPostUrl(action.url);
        recordExternalShare.mutate({ postId, channel: action.platform });
      });
    }

    if (premiumBannerPost) {
      if (!canCreatePremiumBanner) {
        toast({
          title: "Banniere premium non activee",
          description: scheduledIso
            ? "La banniere premium est disponible uniquement pour une publication immediate."
            : "Cette option est reservee aux abonnements Premium et Elite.",
          variant: "destructive",
        });
      } else {
        try {
          const premiumResult = await createPremiumBanner.mutateAsync(postId);
          const reached = Number(premiumResult?.audienceCount ?? premiumAudienceCount);
          const impressions = Number(premiumResult?.impressionsPerViewer ?? premiumImpressionsPerViewer);
          toast({
            title: "Banniere premium activee",
            description: `${reached.toLocaleString("fr-CH")} personne(s) ciblee(s), ${impressions} affichages chacune.`,
          });
        } catch (error) {
          toast({
            title: "Banniere premium non activee",
            description: error instanceof Error ? error.message : "Le post est publie, mais la banniere n'a pas pu etre activee.",
            variant: "destructive",
          });
        }
      }
    }

    if (canCreateSponsoredCheckout) {
      try {
        const redirected = await createSponsoredCheckout(postId, postBody);
        if (redirected) return;
      } catch (error) {
        toast({
          title: "Mise en avant non créée",
          description: error instanceof Error ? error.message : "Le post est publié, mais le paiement du sponsoring n'a pas pu démarrer.",
          variant: "destructive",
        });
      }
    }

    setBody("");
    setFiles([]);
    setFileError(null);
    setPostType("annonce");
    setCtaType("none");
    setCampaignGoal("awareness");
    setAudienceSegment("local");
    setCampaignName("");
    setScheduledAt("");
    setSelectedCrossPostPlatforms([]);
    setCrossPostDialogOpen(false);
    setSponsorPost(false);
    setPremiumBannerPost(false);
    setSponsorDialogOpen(false);
    setSponsorBudget("25");
    setSponsorDurationDays(7);
    setSponsorStrategy("traffic");
    setSponsorCustomerSegment("all");
    setSponsorGenders(["all"]);
    setSponsorCities([]);
    setSponsorCuisines([]);
    setSponsorFavoritesOnly(false);
    setSponsorMinAvgBasket("");
    setSponsorMaxDaysSinceOrder(365);
    setSponsorJourneyTypes(["delivery", "takeaway"]);
    setSponsorServiceMoments([]);
    if (inputRef.current) inputRef.current.value = "";
  };

  const requestSubmit = () => {
    if (!canSubmit) return;
    if (canCrossPostNow) {
      setCrossPostDialogOpen(true);
      return;
    }
    void submit([]);
  };

  return (
    <section className={cn(
      "w-full max-w-full overflow-hidden rounded-[1.75rem] border border-orange-200/80 bg-white shadow-xl shadow-orange-100/60",
      compact ? "p-3 max-sm:rounded-[1.35rem]" : "p-4",
    )}>
      <div className={cn("flex min-w-0 flex-col sm:flex-row", compact ? "gap-2" : "gap-4")}>
        <div className={cn("hidden sm:block", compact ? "pt-1" : "pt-2")}>
          <div className={cn(
            "flex items-center justify-center rounded-full bg-gradient-to-br from-orange-400 to-orange-600 text-white shadow-lg shadow-orange-500/30",
            compact ? "h-10 w-10" : "h-14 w-14",
          )}>
            <Plus className="h-7 w-7" />
          </div>
        </div>

        <div className={cn("min-w-0 flex-1", compact ? "space-y-2.5" : "space-y-4")}>
          <div className="relative">
            <Textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              maxLength={2000}
              placeholder="Quoi de neuf dans votre restaurant ?"
              className={cn(
                "resize-none rounded-2xl border-slate-200 bg-white text-base shadow-inner placeholder:text-slate-400 focus-visible:ring-orange-200",
                compact ? "min-h-[70px] px-4 pb-11 pt-3 text-sm" : "min-h-[92px] px-5 pb-12 pt-4",
              )}
            />
            <input
              ref={inputRef}
              type="file"
              accept={SOCIAL_MEDIA_ACCEPT}
              multiple
              className="hidden"
              onChange={(event) => {
                const selected = Array.from(event.target.files || []);
                try {
                  selected.forEach(assertSafeSocialMediaSourceFileUpload);
                  setFileError(null);
                  setFiles(selected);
                } catch (error) {
                  setFileError((error as Error).message);
                  setFiles([]);
                  event.currentTarget.value = "";
                }
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              className={cn(
                "absolute bottom-2 left-3 h-9 w-9 rounded-xl border-orange-100 bg-white/95 text-slate-700 shadow-sm backdrop-blur hover:border-orange-200 hover:bg-orange-50",
                compact ? "h-8 w-8" : "h-9 w-9",
              )}
              onClick={() => inputRef.current?.click()}
              aria-label="Ajouter un média"
              title={mediaLabel}
            >
              <ImagePlus className={cn(compact ? "h-4 w-4" : "h-5 w-5")} />
            </Button>
          </div>

          {previews.length > 0 ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {previews.map((preview, index) => (
                <div key={`${preview.file.name}-${index}`} className="group relative overflow-hidden rounded-2xl border bg-muted shadow-sm">
                  {preview.file.type.startsWith("video/") ? (
                    <video src={preview.url} className="aspect-video w-full object-cover" muted />
                  ) : (
                    <img src={preview.url} alt={preview.file.name} className="aspect-video w-full object-cover" />
                  )}
                  {preview.file.type.startsWith("video/") ? (
                    <span className="absolute left-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur">
                      <Video className="h-3.5 w-3.5" />
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                    className="absolute right-2 top-2 rounded-full bg-white/90 p-1 shadow-sm hover:bg-white"
                    aria-label="Retirer le média"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          <div
            className={cn(
              "grid min-w-0 grid-cols-1 items-stretch md:grid-cols-2 2xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.05fr)]",
              compact ? "gap-2" : "gap-3",
            )}
          >
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn(
                "h-auto min-h-11 w-full whitespace-normal px-3 text-center leading-snug justify-center gap-2 rounded-xl border-orange-200 bg-orange-50/70 font-semibold text-orange-700 shadow-sm hover:border-orange-300 hover:bg-orange-100 2xl:h-full 2xl:min-h-[4.75rem]",
                compact ? "text-xs" : "text-sm",
              )}
              onClick={() => {
                setAiCopyOpen(true);
                setAiCopyError(null);
              }}
            >
              <Sparkles className="h-4 w-4" />
              Améliorer mon texte avec l'IA
            </Button>

            <div className={cn(
              "min-w-0 overflow-hidden rounded-2xl border bg-white shadow-sm",
              sponsorPost ? "border-orange-200 ring-1 ring-orange-100" : "border-slate-200",
              compact ? "p-2.5" : "p-3",
            )}>
              <div className="flex items-start gap-3 text-sm">
                <Checkbox
                  id="social-post-sponsor"
                  checked={sponsorPost}
                  onCheckedChange={(value) => {
                    const enabled = value === true;
                    setSponsorPost(enabled);
                    if (enabled && !scheduledAt) setSponsorDialogOpen(true);
                  }}
                  disabled={Boolean(scheduledAt)}
                  aria-label="Sponsoriser ce post"
                />
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  disabled={Boolean(scheduledAt)}
                  onClick={() => {
                    if (scheduledAt) return;
                    setSponsorPost(true);
                    setSponsorDialogOpen(true);
                  }}
                >
                  <span className="flex min-w-0 items-center gap-2 font-semibold text-slate-950">
                    <Megaphone className="h-4 w-4 text-orange-600" />
                    <span className="min-w-0 [overflow-wrap:anywhere]">Sponsoriser ce post</span>
                  </span>
                  <span className="mt-0.5 block text-xs leading-5 text-muted-foreground [overflow-wrap:anywhere]">
                    {sponsorPost
                      ? `${sponsorObjectiveLabel} · ${formatChf(sponsorBudgetValue, 0)} · ${sponsorDurationDays} j · ${sponsorEstimate.estimatedPeopleReached.toLocaleString("fr-CH")} vues estimées`
                      : "Mise en avant dans le fil Actualités après paiement."}
                  </span>
                </button>
              </div>

              {scheduledAt ? (
                <p className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-xs text-muted-foreground">
                  Le sponsoring est disponible pour une publication immédiate. Programmez d'abord le post, puis boostez-le après publication.
                </p>
              ) : null}

              {sponsorPost && !scheduledAt ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mt-2 h-8 rounded-xl px-2 text-xs font-semibold text-orange-700 hover:bg-orange-50 hover:text-orange-800"
                  onClick={() => setSponsorDialogOpen(true)}
                >
                  Paramétrer la campagne
                </Button>
              ) : null}
            </div>

            <div className={cn(
              "min-w-0 overflow-hidden rounded-2xl border bg-white shadow-sm",
              premiumBannerPost ? "border-orange-300 ring-1 ring-orange-100" : "border-slate-200",
              compact ? "p-2.5" : "p-3",
            )}>
              <div className="flex items-start gap-3 text-sm">
                <Checkbox
                  id="social-post-premium-banner"
                  checked={premiumBannerPost}
                  onCheckedChange={(value) => setPremiumBannerPost(value === true)}
                  disabled={Boolean(scheduledAt) || premiumBannerAudience.isLoading || !hasPremiumBannerAccess}
                  aria-label="Activer la banniere premium"
                />
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left disabled:cursor-not-allowed"
                  disabled={Boolean(scheduledAt) || premiumBannerAudience.isLoading || !hasPremiumBannerAccess}
                  onClick={() => {
                    if (scheduledAt || premiumBannerAudience.isLoading || !hasPremiumBannerAccess) return;
                    setPremiumBannerPost((enabled) => !enabled);
                  }}
                >
                  <span className="flex min-w-0 items-center gap-2 font-semibold text-slate-950">
                    <Crown className="h-4 w-4 text-orange-600" />
                    <span className="min-w-0 [overflow-wrap:anywhere]">Banniere premium</span>
                  </span>
                  <span className="mt-0.5 block text-xs leading-5 text-muted-foreground [overflow-wrap:anywhere]">
                    {premiumBannerAudience.isLoading
                      ? "Calcul de l'audience..."
                      : hasPremiumBannerAccess
                        ? `${premiumAudienceCount.toLocaleString("fr-CH")} personne(s) ciblee(s) · ${premiumImpressionsPerViewer} affichages chacun`
                        : "Reserve aux abonnements Premium et Elite."}
                  </span>
                </button>
              </div>

              {scheduledAt ? (
                <p className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-xs text-muted-foreground">
                  Disponible uniquement pour une publication immediate.
                </p>
              ) : null}
            </div>

            <div className="grid w-full min-w-0 grid-cols-1 items-stretch gap-2 sm:grid-cols-[minmax(0,1fr)_auto] 2xl:h-full">
              <div className={cn(
                "flex min-w-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 shadow-sm 2xl:h-full 2xl:min-h-[4.75rem]",
                compact ? "py-1.5" : "py-2",
              )}>
                <CalendarClock className="h-4 w-4 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <Label htmlFor="social-post-scheduled-at" className="sr-only">Programmer la publication</Label>
                  <Input
                    id="social-post-scheduled-at"
                    type="datetime-local"
                    min={minimumScheduledAt}
                    value={scheduledAt}
                    onChange={(event) => setScheduledAt(event.target.value)}
                    aria-label="Programmer la publication"
                    className="h-7 w-full min-w-0 border-0 bg-transparent p-0 text-xs shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                  />
                </div>
              </div>
              <Button
                type="button"
                className={cn(
                  "w-full min-w-0 gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 px-5 shadow-lg shadow-orange-500/25 hover:from-orange-600 hover:to-orange-700 sm:w-auto sm:min-w-[8rem] 2xl:h-full 2xl:min-h-[4.75rem]",
                  compact ? "h-10" : "h-11",
                )}
                disabled={!canSubmit}
                onClick={requestSubmit}
              >
                <Send className="h-4 w-4" />
                {createPost.isPending ? "Compression..." : scheduledAt ? "Programmer" : "Publier"}
              </Button>
            </div>
          </div>

        </div>
      </div>
      <Dialog open={sponsorDialogOpen} onOpenChange={setSponsorDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto rounded-3xl sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Megaphone className="h-5 w-5 text-primary" />
              Paramétrer la publication sponsorisée
            </DialogTitle>
            <DialogDescription>
              Choisissez un objectif, une audience et un budget. Le post sera mis en avant après validation du paiement.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
              <p className="text-sm font-semibold text-slate-900">Objectif de campagne</p>
              <RadioGroup
                value={sponsorStrategy}
                onValueChange={(value) => setSponsorStrategy(value as CampaignPricingStrategy)}
                className="grid gap-2 sm:grid-cols-3"
              >
                {SPONSOR_OBJECTIVES.map((objective) => {
                  const config = CAMPAIGN_STRATEGY_CONFIG[objective];
                  return (
                    <Label
                      key={objective}
                      htmlFor={`sponsor-objective-${objective}`}
                      className="flex cursor-pointer flex-col gap-1 rounded-2xl border border-slate-200 bg-white p-3 text-sm shadow-sm hover:border-orange-200 hover:bg-orange-50"
                    >
                      <span className="flex items-center gap-2 font-semibold text-slate-950">
                        <RadioGroupItem id={`sponsor-objective-${objective}`} value={objective} />
                        {config.shortLabel}
                      </span>
                      <span className="text-xs leading-5 text-muted-foreground">{config.description}</span>
                    </Label>
                  );
                })}
              </RadioGroup>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3">
                <Label htmlFor="social-post-sponsor-budget" className="text-sm font-semibold text-slate-900">
                  Budget total
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="social-post-sponsor-budget"
                    type="number"
                    min="1"
                    step="0.01"
                    value={sponsorBudget}
                    onChange={(event) => setSponsorBudget(event.target.value)}
                    className="h-10 rounded-xl text-sm"
                  />
                  <span className="text-sm font-semibold text-slate-600">CHF</span>
                </div>
              </div>
              <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3">
                <Label htmlFor="social-post-sponsor-duration" className="text-sm font-semibold text-slate-900">
                  Durée
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="social-post-sponsor-duration"
                    type="number"
                    min="1"
                    step="1"
                    value={sponsorDurationDays}
                    onChange={(event) => setSponsorDurationDays(Math.max(1, Math.round(Number(event.target.value) || 1)))}
                    className="h-10 rounded-xl text-sm"
                  />
                  <span className="text-sm font-semibold text-slate-600">jours</span>
                </div>
              </div>
            </div>

            <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
              <p className="text-sm font-semibold text-slate-900">Cible de prospects</p>
              <RadioGroup
                value={sponsorCustomerSegment}
                onValueChange={(value) => setSponsorCustomerSegment(value as CampaignCustomerSegment)}
                className="grid gap-2 sm:grid-cols-2"
              >
                {CUSTOMER_SEGMENT_OPTIONS.map((option) => (
                  <Label
                    key={option.value}
                    htmlFor={`sponsor-segment-${option.value}`}
                    className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm hover:border-orange-200 hover:bg-orange-50"
                  >
                    <RadioGroupItem id={`sponsor-segment-${option.value}`} value={option.value} />
                    <span>{option.label}</span>
                  </Label>
                ))}
              </RadioGroup>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3">
                <p className="text-sm font-semibold text-slate-900">Ville</p>
                <div className="max-h-36 space-y-1 overflow-y-auto pr-1">
                  {sponsorCityOptions.length > 0 ? sponsorCityOptions.map((city) => (
                    <Label key={city} htmlFor={`sponsor-city-${city}`} className="flex cursor-pointer items-center gap-2 rounded-xl px-2 py-1.5 text-sm hover:bg-orange-50">
                      <Checkbox
                        id={`sponsor-city-${city}`}
                        checked={sponsorCities.includes(city)}
                        onCheckedChange={(value) => toggleSponsorCity(city, value === true)}
                      />
                      <span>{city}</span>
                    </Label>
                  )) : (
                    <p className="text-xs leading-5 text-muted-foreground">Toutes les villes seront incluses.</p>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">Aucune ville selectionnee = toute la zone TOK.</p>
              </div>

              <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3">
                <p className="text-sm font-semibold text-slate-900">Genre</p>
                <div className="grid gap-1">
                  {GENDER_TARGET_OPTIONS.map((option) => (
                    <Label key={option.value} htmlFor={`sponsor-gender-${option.value}`} className="flex cursor-pointer items-center gap-2 rounded-xl px-2 py-1.5 text-sm hover:bg-orange-50">
                      <Checkbox
                        id={`sponsor-gender-${option.value}`}
                        checked={sponsorGenders.includes(option.value)}
                        onCheckedChange={(value) => toggleSponsorGender(option.value, value === true)}
                      />
                      <span>{option.label}</span>
                    </Label>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3">
              <p className="text-sm font-semibold text-slate-900">Type de cuisine preferee</p>
              <div className="max-h-40 grid gap-1 overflow-y-auto pr-1 sm:grid-cols-2">
                {sponsorCuisineOptions.length > 0 ? sponsorCuisineOptions.map((cuisine) => (
                  <Label key={cuisine} htmlFor={`sponsor-cuisine-${cuisine}`} className="flex cursor-pointer items-center gap-2 rounded-xl px-2 py-1.5 text-sm hover:bg-orange-50">
                    <Checkbox
                      id={`sponsor-cuisine-${cuisine}`}
                      checked={sponsorCuisines.includes(cuisine)}
                      onCheckedChange={(value) => toggleSponsorCuisine(cuisine, value === true)}
                    />
                    <span>{cuisine}</span>
                  </Label>
                )) : (
                  <p className="text-xs leading-5 text-muted-foreground">Toutes les cuisines seront incluses.</p>
                )}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3">
                <p className="text-sm font-semibold text-slate-900">Affinite restaurant</p>
                <Label htmlFor="sponsor-favorites-only" className="flex cursor-pointer items-center gap-2 py-1.5 text-sm">
                  <Checkbox
                    id="sponsor-favorites-only"
                    checked={sponsorFavoritesOnly}
                    onCheckedChange={(value) => setSponsorFavoritesOnly(value === true)}
                  />
                  <span>Fans et clients ayant deja interagi</span>
                </Label>
              </div>

              <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3">
                <Label htmlFor="sponsor-min-basket" className="text-sm font-semibold text-slate-900">
                  Panier moyen minimum
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="sponsor-min-basket"
                    type="number"
                    min="0"
                    step="1"
                    value={sponsorMinAvgBasket}
                    onChange={(event) => setSponsorMinAvgBasket(event.target.value)}
                    placeholder="Tous"
                    className="h-10 rounded-xl text-sm"
                  />
                  <span className="text-sm font-semibold text-slate-600">CHF</span>
                </div>
              </div>

              <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3">
                <Label htmlFor="sponsor-max-days" className="text-sm font-semibold text-slate-900">
                  Activite recente
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="sponsor-max-days"
                    type="number"
                    min="1"
                    step="1"
                    value={sponsorMaxDaysSinceOrder}
                    onChange={(event) => setSponsorMaxDaysSinceOrder(Math.max(1, Math.round(Number(event.target.value) || 365)))}
                    className="h-10 rounded-xl text-sm"
                  />
                  <span className="text-sm font-semibold text-slate-600">jours</span>
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3">
                <p className="text-sm font-semibold text-slate-900">Conversions recherchées</p>
                {JOURNEY_TYPE_OPTIONS.map((option) => (
                  <Label key={option.value} htmlFor={`sponsor-journey-${option.value}`} className="flex cursor-pointer items-center gap-2 py-1.5 text-sm">
                    <Checkbox
                      id={`sponsor-journey-${option.value}`}
                      checked={sponsorJourneyTypes.includes(option.value)}
                      onCheckedChange={(value) => toggleSponsorJourneyType(option.value, value === true)}
                    />
                    <span>{option.label}</span>
                  </Label>
                ))}
              </div>
              <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3">
                <p className="text-sm font-semibold text-slate-900">Moments à pousser</p>
                {SERVICE_MOMENT_OPTIONS.map((option) => (
                  <Label key={option.value} htmlFor={`sponsor-moment-${option.value}`} className="flex cursor-pointer items-center gap-2 py-1.5 text-sm">
                    <Checkbox
                      id={`sponsor-moment-${option.value}`}
                      checked={sponsorServiceMoments.includes(option.value)}
                      onCheckedChange={(value) => toggleSponsorServiceMoment(option.value, value === true)}
                    />
                    <span>{option.label}</span>
                  </Label>
                ))}
              </div>
            </div>

            <div className="grid gap-2 rounded-2xl border border-orange-100 bg-orange-50 p-3 text-sm text-orange-950 sm:grid-cols-4">
              <div>
                <p className="text-xs text-orange-700">Budget / jour</p>
                <p className="font-bold">{formatChf(sponsorEstimate.dailyBudget)}</p>
              </div>
              <div>
                <p className="text-xs text-orange-700">CPC estimé</p>
                <p className="font-bold">{formatChf(sponsorEstimate.estimatedCpc)}</p>
              </div>
              <div>
                <p className="text-xs text-orange-700">Prospects touchés</p>
                <p className="font-bold">{sponsorEstimate.estimatedPeopleReached.toLocaleString("fr-CH")}</p>
              </div>
              <div>
                <p className="text-xs text-orange-700">Conversions</p>
                <p className="font-bold">{sponsorEstimate.projectedConversions.toLocaleString("fr-CH")}</p>
              </div>
            </div>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
              <Button
                type="button"
                variant="outline"
                className="rounded-xl"
                onClick={() => {
                  setSponsorPost(false);
                  setSponsorDialogOpen(false);
                }}
              >
                Ne pas sponsoriser
              </Button>
              <Button
                type="button"
                className="rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700"
                disabled={sponsorBudgetValue <= 0}
                onClick={() => {
                  setSponsorPost(true);
                  setSponsorDialogOpen(false);
                }}
              >
                Enregistrer le sponsoring
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={crossPostDialogOpen} onOpenChange={setCrossPostDialogOpen}>
        <DialogContent className="rounded-3xl sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Share2 className="h-5 w-5 text-primary" />
              Publier aussi sur vos réseaux ?
            </DialogTitle>
            <DialogDescription>
              Le post sera publié sur TOK. Vous pouvez aussi ouvrir vos réseaux connectés pour relayer le contenu.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="grid gap-2">
              {availableCrossPostPlatforms.map((platform) => {
                const Icon = SOCIAL_CROSS_POST_ICONS[platform];
                const label = SOCIAL_CROSS_POST_LABELS[platform];
                const checkboxId = `social-cross-post-dialog-${platform}`;
                const checked = selectedCrossPostPlatforms.includes(platform);

                return (
                  <Label
                    key={platform}
                    htmlFor={checkboxId}
                    className="flex cursor-pointer items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm transition hover:border-orange-200 hover:bg-orange-50"
                  >
                    <Checkbox
                      id={checkboxId}
                      checked={checked}
                      aria-label={label}
                      onCheckedChange={(value) => {
                        setSelectedCrossPostPlatforms((current) => {
                          if (value === true) return current.includes(platform) ? current : [...current, platform];
                          return current.filter((item) => item !== platform);
                        });
                      }}
                    />
                    <Icon className="h-4 w-4 text-primary" />
                    <span className="font-medium">{label}</span>
                  </Label>
                );
              })}
            </div>

            <p className="text-xs leading-5 text-muted-foreground">
              Instagram et TikTok copient le texte puis ouvrent le profil. Facebook ouvre une fenêtre de partage.
            </p>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                className="rounded-xl"
                onClick={() => void submit([])}
              >
                Publier uniquement sur TOK
              </Button>
              <Button
                type="button"
                className="rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700"
                disabled={selectedCrossPostPlatforms.length === 0}
                onClick={() => void submit(selectedCrossPostPlatforms)}
              >
                Publier et partager
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={aiCopyOpen} onOpenChange={setAiCopyOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto rounded-3xl sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Améliorer mon texte avec l'IA
            </DialogTitle>
            <DialogDescription>
              Répondez aux questions clés. TOK génère ensuite 3 variantes prêtes à publier.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {AI_COPY_QUESTIONS.map((question) => (
              <div key={question.key} className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
                <p className="text-sm font-semibold text-slate-900">{question.title}</p>
                <RadioGroup
                  value={aiCopyAnswers[question.key]}
                  onValueChange={(value) => setAiCopyAnswer(question.key, value)}
                  className="grid gap-2 sm:grid-cols-2"
                >
                  {question.options.map((option) => {
                    const id = `ai-copy-${question.key}-${option.replace(/\W+/g, "-")}`;
                    return (
                      <Label
                        key={option}
                        htmlFor={id}
                        className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm hover:border-orange-200 hover:bg-orange-50"
                      >
                        <RadioGroupItem id={id} value={option} />
                        <span>{option}</span>
                      </Label>
                    );
                  })}
                </RadioGroup>
              </div>
            ))}

            <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
              <Label htmlFor="ai-copy-offer" className="text-sm font-semibold text-slate-900">
                Offre, plat ou précision à intégrer
              </Label>
              <Input
                id="ai-copy-offer"
                value={aiCopyAnswers.offer}
                onChange={(event) => setAiCopyAnswer("offer", event.target.value)}
                placeholder="Ex: plat du jour, 10% aujourd'hui, 6 tables restantes..."
                className="rounded-xl bg-white"
              />
            </div>

            <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
              <p className="text-sm font-semibold text-slate-900">Quels points faut-il mettre en avant ?</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {AI_COPY_STRENGTHS.map((strength) => {
                  const id = `ai-copy-strength-${strength.replace(/\W+/g, "-")}`;
                  const checked = aiCopyAnswers.strengths.includes(strength);
                  return (
                    <Label
                      key={strength}
                      htmlFor={id}
                      className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm hover:border-orange-200 hover:bg-orange-50"
                    >
                      <Checkbox
                        id={id}
                        checked={checked}
                        onCheckedChange={(value) => toggleAiCopyStrength(strength, value === true)}
                      />
                      <span>{strength}</span>
                    </Label>
                  );
                })}
              </div>
            </div>

            {aiCopyError ? (
              <p className="rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm font-medium text-destructive">
                {aiCopyError}
              </p>
            ) : null}

            <Button
              type="button"
              className="h-11 w-full gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 font-semibold shadow-lg shadow-orange-500/25 hover:from-orange-600 hover:to-orange-700"
              disabled={!canGenerateAiCopy}
              onClick={generateAiCopy}
            >
              {aiCopyLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {aiCopyLoading ? "Génération..." : "Générer 3 variantes"}
            </Button>

            {aiCopyVariants.length > 0 ? (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-slate-900">Choisissez une variante</p>
                <div className="grid gap-3">
                  {aiCopyVariants.map((variant, index) => (
                    <button
                      key={`${variant.title}-${index}`}
                      type="button"
                      onClick={() => applyAiCopyVariant(variant)}
                      className="rounded-2xl border border-orange-100 bg-white p-4 text-left shadow-sm transition hover:border-orange-300 hover:bg-orange-50"
                    >
                      <span className="text-xs font-bold uppercase text-orange-600">Variante {index + 1}</span>
                      <p className="mt-1 text-sm font-semibold text-slate-950">{variant.title}</p>
                      <p className="mt-2 text-sm leading-6 text-slate-700">{variant.body}</p>
                      <span className="mt-3 inline-flex rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold text-orange-700">
                        Utiliser ce texte
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
