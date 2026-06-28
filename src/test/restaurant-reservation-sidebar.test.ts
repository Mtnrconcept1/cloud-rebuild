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

  it("preserves the clicked reservation slot when the dialog normalizes available times", () => {
    const reservationDialog = read("src/components/ReservationDialog.tsx");

    expect(reservationDialog).toContain("const normalizedInitialTime = initialTime?.slice(0, 5);");
    expect(reservationDialog).toContain("if (normalizedInitialTime && time === normalizedInitialTime) return;");
  });
});
