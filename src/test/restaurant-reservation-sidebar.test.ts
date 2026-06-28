import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("restaurant reservation sidebar", () => {
  it("keeps the sticky reservation widget bottom-constrained to the viewport", () => {
    const restaurantDetail = read("src/pages/RestaurantDetail.tsx");

    expect(restaurantDetail).toContain("reservationSidebarRef");
    expect(restaurantDetail).toContain("RESERVATION_SIDEBAR_BOTTOM_GAP");
    expect(restaurantDetail).toContain("ResizeObserver");
    expect(restaurantDetail).toContain("bottomAlignedTop");
    expect(restaurantDetail).toContain("--reservation-sidebar-sticky-top");
    expect(restaurantDetail).toContain("lg:top-[var(--reservation-sidebar-sticky-top)]");
    expect(restaurantDetail).not.toContain("sticky top-24 space-y-4");
    expect(restaurantDetail).not.toContain("lg:overflow-y-auto");
  });

  it("keeps a reservation deeplink open while restaurant data is still loading", () => {
    const restaurantDetail = read("src/pages/RestaurantDetail.tsx");

    expect(restaurantDetail).toContain("isRestaurantFetched");
    expect(restaurantDetail).toContain("if (!isRestaurantFetched) return;");
    expect(restaurantDetail).toContain("[isRestaurantFetched, reservationAvailable, reservationOpen]");
  });

  it("opens card slot reservation deeplinks from initial state to avoid a detail-page flash", () => {
    const restaurantDetail = read("src/pages/RestaurantDetail.tsx");

    expect(restaurantDetail).toContain("function isReservationQueryIntent");
    expect(restaurantDetail).toContain("function getReservationQueryDefaults");
    expect(restaurantDetail).toContain("const [reservationOpen, setReservationOpen] = useState(() => reservationQueryIntent)");
    expect(restaurantDetail).toContain("useState<{ date?: Date; time?: string; partySize?: number; }>(() => getReservationQueryDefaults(searchParams))");
    expect(restaurantDetail).toContain("const reservationQueryIntentAppliedRef = useRef<string | null>(reservationQueryIntent ? searchParams.toString() : null)");
  });

  it("keeps reservation deeplinks on a loading surface until the dialog can mount", () => {
    const restaurantDetail = read("src/pages/RestaurantDetail.tsx");

    expect(restaurantDetail).toContain("function ReservationDeeplinkLoading");
    expect(restaurantDetail).toContain("const { activeFeatures, loading: featureFlagsLoading } = useFeatureFlagSnapshot();");
    expect(restaurantDetail).toContain("reservationQueryIntent && reservationOpen && (featureFlagsLoading || !isRestaurantFetched)");
    expect(restaurantDetail).toContain("return <ReservationDeeplinkLoading />;");
  });

  it("allows the same card slot deeplink to reopen after closing the reservation dialog", () => {
    const restaurantDetail = read("src/pages/RestaurantDetail.tsx");

    expect(restaurantDetail).toContain("function stripReservationQueryIntent");
    expect(restaurantDetail).toContain("reservationQueryIntentAppliedRef.current = null;");
    expect(restaurantDetail).toContain("reservationQueryIntentAppliedRef.current !== reservationQueryKey");
    expect(restaurantDetail).toContain("const handleReservationOpenChange = (open: boolean) => {");
    expect(restaurantDetail).toContain("stripReservationQueryIntent(searchParams)");
    expect(restaurantDetail).toContain("onOpenChange={handleReservationOpenChange}");
  });

  it("keeps reservation slot tap handling isolated from card navigation", () => {
    const restaurantCard = read("src/components/RestaurantCard.tsx");
    const sponsoredTemplate = read("src/components/campaigns/SponsoredRestaurantTemplateCard.tsx");

    expect(restaurantCard).toContain("function isNestedCardActionTarget");
    expect(restaurantCard).toContain('target.closest("[data-card-action]")');
    expect(restaurantCard).toContain('data-card-action="reservation-slot"');
    expect(restaurantCard).toContain('data-testid="restaurant-card-reservation-slot"');
    expect(restaurantCard).toContain("onPointerDown={stopNestedCardAction}");
    expect(restaurantCard).toContain("onMouseDown={stopNestedCardAction}");
    expect(restaurantCard).toContain("onTouchStart={stopNestedCardAction}");
    expect(sponsoredTemplate).toContain('data-card-action="reservation-slot"');
    expect(sponsoredTemplate).toContain('data-testid="restaurant-card-reservation-slot"');
    expect(sponsoredTemplate).toContain("onPointerDown={stopNestedCardAction}");
    expect(sponsoredTemplate).toContain("onMouseDown={stopNestedCardAction}");
    expect(sponsoredTemplate).toContain("onTouchStart={stopNestedCardAction}");
  });

  it("preserves the clicked reservation slot when the dialog normalizes available times", () => {
    const reservationDialog = read("src/components/ReservationDialog.tsx");

    expect(reservationDialog).toContain("const normalizedInitialTime = initialTime?.slice(0, 5);");
    expect(reservationDialog).toContain("if (normalizedInitialTime && time === normalizedInitialTime) return;");
  });
});
