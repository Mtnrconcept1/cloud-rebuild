import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildOrderConfirmationEmail,
  buildReservationConfirmationEmail,
} from "../../supabase/functions/_shared/transactional-emails";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("transactional order and reservation emails", () => {
  it("builds a complete TOK order recap email with brand assets and useful links", () => {
    const email = buildOrderConfirmationEmail({
      audience: "customer",
      appBaseUrl: "https://www.thetok.ch",
      orderId: "order-1",
      orderReference: "TOK-78452",
      customerName: "Alex",
      customerEmail: "alex@example.com",
      restaurantName: "TOK Paris Opéra",
      restaurantAddress: "15 rue de la Paix",
      restaurantCity: "75002 Paris",
      orderTypeLabel: "Sur place",
      createdAt: "2025-05-24T12:45:00.000Z",
      scheduledLabel: "24 mai 2025 à 12:45",
      subtotal: 32.2,
      serviceFee: 1.8,
      discount: 0,
      total: 34,
      detailUrl: "https://www.thetok.ch/commande/order-1",
      items: [
        { name: "Menu TOK Burger", description: "Burger, frites, boisson", quantity: 1, unitPrice: 12.9, totalPrice: 12.9 },
        { name: "Pizza Margherita", description: "Tomate, mozzarella, basilic", quantity: 1, unitPrice: 11.9, totalPrice: 11.9 },
      ],
    });

    expect(email.subject).toContain("TOK-78452");
    expect(email.bodyHtml).toContain("Merci pour votre commande");
    expect(email.bodyHtml).toContain("https://www.thetok.ch/logotok.png");
    expect(email.bodyHtml).toContain("https://www.thetok.ch/chef2.png");
    expect(email.bodyHtml).toContain("Numéro de commande");
    expect(email.bodyHtml).toContain("TOK Paris Opéra");
    expect(email.bodyHtml).toContain("Menu TOK Burger");
    expect(email.bodyHtml).toContain("34.00 CHF");
    expect(email.bodyHtml).toContain("https://www.thetok.ch/commande/order-1");
    expect(email.bodyText).toContain("Menu TOK Burger x1");
  });

  it("builds a complete TOK reservation recap email for the restaurant", () => {
    const email = buildReservationConfirmationEmail({
      audience: "restaurant",
      appBaseUrl: "https://www.thetok.ch",
      reservationId: "reservation-1",
      customerName: "Alex",
      customerEmail: "alex@example.com",
      restaurantName: "Quirinale",
      restaurantAddress: "Rue de Graman",
      restaurantCity: "Puplinge",
      date: "2026-06-15",
      time: "19:00",
      partySize: 2,
      featureLabel: "Réservation classique",
      notes: "Table calme",
      total: 0,
      detailUrl: "https://www.thetok.ch/dashboard/reservations",
      items: [],
    });

    expect(email.subject).toContain("Nouvelle réservation");
    expect(email.bodyHtml).toContain("Nouvelle réservation reçue");
    expect(email.bodyHtml).toContain("https://www.thetok.ch/logotok.png");
    expect(email.bodyHtml).toContain("https://www.thetok.ch/chef2.png");
    expect(email.bodyHtml).toContain("Alex");
    expect(email.bodyHtml).toContain("2 convive(s)");
    expect(email.bodyHtml).toContain("15 juin 2026 à 19:00");
    expect(email.bodyHtml).toContain("Table calme");
    expect(email.bodyHtml).toContain("https://www.thetok.ch/dashboard/reservations");
    expect(email.bodyText).toContain("Réservation reservation-1");
  });


  it("renders an accessible responsive TOK booking email for customers", () => {
    const email = buildReservationConfirmationEmail({
      audience: "customer", reservationId: "4a8d821b-5b92-4e6f-bbf3-c436f0557b4c",
      customerName: "Raph", restaurantName: "La Gazelle d’Or",
      restaurantAddress: "Rue de Lyon 55", restaurantCity: "Genève",
      date: "2026-10-20", time: "19:00", partySize: 2,
      featureLabel: "Réservation classique", items: [],
      detailUrl: "https://www.thetok.ch/reservations",
    });
    expect(email.bodyHtml).toContain("Votre réservation");
    expect(email.bodyHtml).toContain("confirmée !");
    expect(email.bodyHtml).toContain("20 octobre 2026 à 19:00");
    expect(email.bodyHtml).toContain("La Gazelle d’Or");
    expect(email.bodyHtml).toContain("Rue de Lyon 55, Genève");
    expect(email.bodyHtml).toContain("4a8d821b-5b92-4e6f-bbf3-c436f0557b4c");
    expect(email.bodyHtml).toContain("/logotok.png");
    expect(email.bodyHtml).toContain("/chef2.png");
    expect(email.bodyHtml).toContain("/images/octopus-fine-dining.jpeg");
    expect(email.bodyHtml).toContain("/images/emails/tok-reservation-hero.jpg");
    expect(email.bodyHtml).not.toContain("/images/emails/tok-reservation-hero.webp");
    expect(email.bodyHtml).toContain('width="700" height="350"');
    expect(email.bodyHtml).toContain('bgcolor="#20140e" style="width:68%;padding:20px 18px;background-color:rgba(20,14,10,.90)');
    expect(email.bodyHtml).toContain('bgcolor="#20140e" style="background-color:rgba(20,14,10,.93)');
    expect(email.bodyHtml).toContain("Votre réservation est confirmée !");
    expect(email.bodyHtml).toContain('class="tok-hero-desktop"');
    expect(email.bodyHtml).toContain('class="tok-hero-mobile"');
    expect(email.bodyHtml).toContain("/images/mixed-grill-platter.jpeg");
    expect(email.bodyHtml).toContain("@media only screen and (max-width:600px)");
    expect(email.bodyHtml).toContain("width:50%!important");
    expect(email.bodyHtml).toContain("Voir ou modifier ma réservation");
    expect(email.bodyHtml).toContain("Cet e-mail confirme une réservation effectuée sur TOK.");
    expect(email.bodyHtml).toContain("La Tok d’Or");
    expect(email.bodyHtml).toContain("2 % reversés à l’Hospice Général");
    expect(email.bodyHtml).toContain('href="https://www.thetok.ch/chefs-table"');
    expect(email.bodyHtml).not.toContain("Votre précommande");
    expect(email.bodyText).toContain("20 octobre 2026 à 19:00");
  });

  it("uses a real JPEG asset compatible with Outlook for the reservation hero", () => {
    const image = readFileSync(resolve(process.cwd(), "public/images/emails/tok-reservation-hero.jpg"));
    expect([...image.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
    expect(image.length).toBeGreaterThan(20_000);
    expect(image.length).toBeLessThan(500_000);
  });

  it("escapes variable HTML and shows preorders and notes only when present", () => {
    const email = buildReservationConfirmationEmail({
      audience: "customer", reservationId: "reservation-2",
      customerName: "<script>bad</script>", restaurantName: 'Le "Bistro" <img>',
      date: "2026-10-20", time: "20:30", partySize: 3,
      featureLabel: "Zéro Attente", notes: "<b>Fenêtre</b>",
      items: [{ name: "Plat <spécial>", quantity: 2, unitPrice: 12.5 }],
      total: 25, detailUrl: "https://www.thetok.ch/reservations",
    });
    expect(email.bodyHtml).not.toContain("<script>");
    expect(email.bodyHtml).not.toContain("<img>");
    expect(email.bodyHtml).toContain("&lt;script&gt;");
    expect(email.bodyHtml).toContain("&lt;img&gt;");
    expect(email.bodyHtml).toContain("&lt;b&gt;Fenêtre&lt;/b&gt;");
    expect(email.bodyHtml).toContain("Votre précommande");
    expect(email.bodyHtml).toContain("Plat &lt;spécial&gt;");
    expect(email.bodyHtml).toContain("25.00 CHF");
  });

  it("wires transactional emails from every order and reservation creation flow", () => {
    expect(read("supabase/functions/validate-order/index.ts")).toContain("queueOrderConfirmationEmails");
    expect(read("supabase/functions/_shared/order-checkout.ts")).toContain("queueOrderConfirmationEmails");
    expect(read("supabase/functions/_shared/zero-attente.ts")).toContain("queueReservationConfirmationEmails");
    expect(read("supabase/functions/_shared/chefs-table.ts")).toContain("queueReservationConfirmationEmails");
    expect(read("supabase/functions/create-reservation/index.ts")).toContain("validate_and_create_reservation_safe");
    expect(read("supabase/functions/create-reservation/index.ts")).toContain("queueReservationConfirmationEmails");
    expect(read("src/lib/reservationMutations.ts")).toContain('functions.invoke("create-reservation"');
    expect(read("supabase/config.toml")).toContain("[functions.create-reservation]\nverify_jwt = false");
    expect(read("supabase/functions/create-reservation/index.ts")).toContain("authenticateRequest(req, { allowServiceRole: false })");
  });
});
