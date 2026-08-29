import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  __restaurantSeoInternals,
  buildRestaurantSeoModel,
} from "../lib/seo/restaurantEntity.mjs";

function getGraphNode(model: NonNullable<ReturnType<typeof buildRestaurantSeoModel>>, type: string) {
  const graph = model.jsonLd["@graph"] as Array<Record<string, unknown>>;
  return graph.find((node) => node["@type"] === type);
}

describe("restaurant entity SEO", () => {
  it("builds one coherent Restaurant/WebPage/Breadcrumb/Menu graph from real data", () => {
    const model = buildRestaurantSeoModel({
      restaurant: {
        id: "restaurant-1",
        name: "La Table Test",
        city: "Genève",
        address: "Rue du Rhône 1",
        postal_code: "1204",
        cuisine_type: "Italien, Brunch +3",
        price_range: 2,
        phone: "+41 22 000 00 00",
        latitude: 46.2044,
        longitude: 6.1432,
        supports_reservation: true,
        supports_pickup: true,
        delivery_available: false,
        supports_dinein: true,
        opening_hours: {
          lundi: { open: "12:00", close: "14:30" },
        },
        updated_at: "2026-08-29T00:00:00Z",
      },
      canonicalPath: "/restaurant/la-table-test-restaurant-1",
      heroImage: "/images/restaurant.jpg",
      images: [{ media_url: "https://cdn.example.com/dining-room.webp" }],
      menuItems: [
        {
          id: "dish-1",
          name: "Risotto",
          description: "Risotto aux légumes de saison",
          price: 28,
          category: "Plats",
          is_available: true,
        },
      ],
      reviews: [
        {
          id: "review-1",
          user_name: "Camille",
          rating: 9,
          comment: "Très bonne adresse.",
          created_at: "2026-08-20T10:00:00Z",
          status: "published",
        },
      ],
      amenities: [{ label: "Terrasse" }],
      averageRating: 9,
      reviewCount: 1,
    });

    expect(model).not.toBeNull();
    expect(model?.title).toContain("La Table Test");
    expect(model?.description).toContain("réservation");
    expect(model?.cuisines).toEqual(["Italien", "Brunch"]);
    expect(model?.lastUpdatedLabel).toBe("29 août 2026");

    const webPage = getGraphNode(model!, "WebPage");
    const restaurant = getGraphNode(model!, "Restaurant");
    const breadcrumb = getGraphNode(model!, "BreadcrumbList");
    const menu = getGraphNode(model!, "Menu");

    expect(webPage?.mainEntity).toEqual({
      "@id": "https://www.thetok.ch/restaurant/la-table-test-restaurant-1#restaurant",
    });
    expect(restaurant?.geo).toEqual({
      "@type": "GeoCoordinates",
      latitude: 46.2044,
      longitude: 6.1432,
    });
    expect(restaurant?.aggregateRating).toMatchObject({
      ratingValue: 9,
      reviewCount: 1,
    });
    expect(restaurant?.openingHoursSpecification).toEqual([
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: "https://schema.org/Monday",
        opens: "12:00",
        closes: "14:30",
      },
    ]);
    expect(restaurant?.acceptsReservations).toBe(true);
    expect(restaurant?.amenityFeature).toEqual([
      {
        "@type": "LocationFeatureSpecification",
        name: "Terrasse",
        value: true,
      },
    ]);
    expect(breadcrumb).toBeDefined();
    expect(menu).toBeDefined();
    expect(JSON.stringify(menu)).toContain('"priceCurrency":"CHF"');
  });

  it("shows service hours without inventing weekdays or a generic timetable", () => {
    const serviceHours = __restaurantSeoInternals.parseOpeningHours({
      service_settings: {
        lunch: {
          start_time: "12:00",
          end_time: "14:30",
          service_closed: false,
        },
        dinner: {
          start_time: "19:00",
          end_time: "22:30",
          service_closed: false,
        },
      },
    });

    expect(serviceHours.rows).toEqual([
      { key: "service-lunch", label: "Déjeuner", hours: "12:00–14:30" },
      { key: "service-dinner", label: "Dîner", hours: "19:00–22:30" },
    ]);
    expect(serviceHours.specifications).toEqual([]);
    expect(__restaurantSeoInternals.parseOpeningHours({}).rows).toEqual([]);
  });

  it("omits rating, geo and booking claims when the source data does not support them", () => {
    const model = buildRestaurantSeoModel({
      restaurant: {
        id: "restaurant-2",
        name: "Sans Donnée Inventée",
        city: "Lausanne",
        cuisine_type: "Vegan +4",
        latitude: 190,
        longitude: 200,
        supports_reservation: false,
        supports_pickup: false,
        delivery_available: false,
        supports_dinein: false,
        opening_hours: null,
      },
      canonicalPath: "/restaurant/sans-donnee-inventee-restaurant-2",
      averageRating: 10,
      reviewCount: 0,
    });

    expect(model).not.toBeNull();
    expect(model?.description).not.toContain("réservation");
    expect(model?.description).not.toContain("livraison");
    expect(model?.cuisines).toEqual(["Vegan"]);

    const restaurant = getGraphNode(model!, "Restaurant");
    expect(restaurant?.aggregateRating).toBeUndefined();
    expect(restaurant?.geo).toBeUndefined();
    expect(restaurant?.potentialAction).toBeUndefined();
    expect(model?.openingHoursRows).toEqual([]);
  });

  it("keeps fabricated schedules and review sub-scores out of the restaurant page", () => {
    const source = readFileSync(
      path.resolve(process.cwd(), "src/pages/RestaurantDetail.tsx"),
      "utf8",
    );

    expect(source).not.toContain("Lundi - Dimanche : 11h30 - 22h30");
    expect(source).not.toContain("Number(avgRating) * 0.95");
    expect(source).not.toContain("Number(avgRating) * 1.02");
    expect(source).toContain("Provenance et fraîcheur des informations");
  });
});
