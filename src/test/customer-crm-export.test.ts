import { describe, expect, it } from "vitest";

import { buildCustomerCrmCsv, buildCustomerCrmXls, type CustomerCrmProfile } from "@/lib/customerCrm";

function profile(overrides: Partial<CustomerCrmProfile> = {}): CustomerCrmProfile {
  return {
    userId: "user-1",
    firstName: "Raph",
    lastName: "Test",
    fullName: "Raph Test",
    email: "raph@example.com",
    phone: "+41790000000",
    city: "Geneve",
    address: "Rue du Test 1",
    avatarUrl: null,
    loyaltyPoints: 120,
    totalOrders: 3,
    totalReservations: 2,
    restaurantsCount: 1,
    totalSpent: 123.45,
    avgOrderValue: 41.15,
    firstSeenAt: "2026-06-01T10:00:00Z",
    lastActivityAt: "2026-06-15T12:00:00Z",
    lastOrderAt: "2026-06-14T12:00:00Z",
    lastReservationAt: "2026-06-12T18:00:00Z",
    lastRestaurantName: "Quirinale",
    preferredChannel: "mixed",
    preferredService: "dinner",
    preferredWeekday: 5,
    favoriteOrderHour: 12,
    favoriteReservationHour: 19,
    favoriteItems: [{ label: 'Pizza "speciale"; menu', category: "Pizza", quantity: 2, orders: 2 }],
    favoriteCuisines: ["italien", "pizza"],
    crmScore: 82,
    totalMatchingCount: 1,
    ...overrides,
  };
}

describe("buildCustomerCrmCsv", () => {
  const brokenUtf8Markers = ["\u00c3", "\u00c2", "\ufffd"];

  it("exports CRM profiles as semicolon CSV with escaped cells and protected phones", () => {
    const csv = buildCustomerCrmCsv([
      profile({ phone: "022 123 45 67" }),
      profile({ userId: "user-2", phone: "+41 79 000 00 00" }),
    ]);

    expect(csv).toContain('"Nom complet";"Prenom";"Nom";"Email"');
    expect(csv).toContain('"Raph Test";"Raph";"Test";"raph@example.com"');
    expect(csv).toContain('"=""022 123 45 67"""');
    expect(csv).toContain('"=""+41 79 000 00 00"""');
    expect(csv).toContain('"123.45";"41.15"');
    expect(csv).toContain('"Pizza ""speciale""; menu x2"');
  });

  it("exports Excel XML with autofilter and text-formatted phone cells", () => {
    const xls = buildCustomerCrmXls([profile({ phone: "022 123 45 67" })]);

    expect(xls).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xls).toContain('<AutoFilter x:Range="R1C1:R2C28"');
    expect(xls).toContain('<Worksheet ss:Name="CRM clients">');
    expect(xls).toContain('<Cell ss:StyleID="Text"><Data ss:Type="String">022 123 45 67</Data></Cell>');
    expect(xls).toContain('Pizza &quot;speciale&quot;; menu x2');
    for (const marker of brokenUtf8Markers) {
      expect(xls).not.toContain(marker);
    }
  });
});
