import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  bayesianRating,
  buildDiscoveryPayload,
  buildDiscoverySelection,
  cuisineAffinity,
  describeDiscoverySelection,
  extractDiscoveryCity,
  extractDiscoveryDate,
  findDiscoveryCuisine,
  mapRestaurantToCard,
  mapRestaurantToDetail,
  normalizeOpeningHours,
  parseTokDiscoveryRequest,
  runTokDiscovery,
  runTokRestaurantDetail,
  scoreDiscoveryCandidate,
  buildSandboxDiscoveryPayload,
  buildDiscoveryOrFilter,
  scaleDiscoveryIntents,
  TokDiscoveryError,
  type TokDiscoveryClient,
  type TokRestaurantRow,
} from "../../supabase/functions/_shared/tok-connect-discovery.ts";
import {
  TOK_DISCOVERY_RESOURCE_URI,
  TOK_DISCOVERY_WIDGET_HTML,
  buildTokDiscoveryResourceContents,
  buildTokDiscoveryResourceDescriptor,
  buildTokDiscoveryToolMeta,
} from "../../supabase/functions/_shared/tok-connect-discovery-widget.ts";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const restaurant = (overrides: Partial<TokRestaurantRow> & { id: string; name: string }): TokRestaurantRow => ({
  city: "Genève",
  address: "Rue du Rhône 1",
  is_active: true,
  supports_reservation: true,
  ...overrides,
});

describe("TOK Connect discovery - compréhension de la demande", () => {
  it("comprend « 3 pizzeria et deux restaurant de sushi à Genève »", () => {
    const request = parseTokDiscoveryRequest("fais moi une sélection de 3 pizzeria et deux restaurant de sushi à Genève");

    expect(request.city).toBe("Genève");
    expect(request.intents.map((intent) => [intent.key, intent.count])).toEqual([
      ["pizza", 3],
      ["sushi", 2],
    ]);
    expect(request.totalRequested).toBe(5);
  });

  it("comprend la même demande en anglais et en chiffres", () => {
    const request = parseTokDiscoveryRequest("find me 3 pizzerias and 2 sushi restaurants in Lausanne");
    expect(request.city).toBe("Lausanne");
    expect(request.intents.map((intent) => intent.key)).toEqual(["pizza", "sushi"]);
    expect(request.intents.map((intent) => intent.count)).toEqual([3, 2]);
  });

  it("retient un total raisonnable quand aucune quantité n'est donnée", () => {
    const request = parseTokDiscoveryRequest("un bon japonais à Carouge");
    expect(request.intents[0]?.key).toBe("sushi");
    // « un » est un article, pas une quantité : on propose une vraie sélection.
    expect(request.intents[0]?.count).toBe(5);
    expect(request.city).toBe("Carouge");
  });

  it("respecte en revanche une quantité écrite en chiffres", () => {
    const request = parseTokDiscoveryRequest("1 pizzeria à Genève");
    expect(request.intents[0]?.count).toBe(1);
  });

  it("ne confond pas une cuisine avec une ville", () => {
    expect(extractDiscoveryCity("2 restaurants à sushi")).toBeNull();
    expect(extractDiscoveryCity("des burgers près de Nyon")).toBe("Nyon");
  });

  it("extrait le nombre de convives et la date", () => {
    const today = new Date("2026-09-08T10:00:00.000Z");
    const request = parseTokDiscoveryRequest("réserve une table pour 4 personnes demain à Genève", today);
    expect(request.partySize).toBe(4);
    expect(request.date).toBe("2026-09-09");
    expect(request.requiresReservation).toBe(true);
    expect(extractDiscoveryDate("le 2026-12-24 à Genève", today)).toBe("2026-12-24");
  });

  it("reconnaît les synonymes de cuisine", () => {
    expect(findDiscoveryCuisine("pizzeria")?.key).toBe("pizza");
    expect(findDiscoveryCuisine("Japonais")?.key).toBe("sushi");
    expect(findDiscoveryCuisine("tacos")?.key).toBe("mexicain");
    expect(findDiscoveryCuisine("krypton")).toBeNull();
  });
});

describe("TOK Connect discovery - classement des adresses", () => {
  it("privilégie une note fiable plutôt qu'un 5/5 sur deux avis", () => {
    const solid = bayesianRating(4.7, 400);
    const anecdotal = bayesianRating(5, 2);
    expect(solid).toBeGreaterThan(anecdotal);
  });

  it("mesure l'affinité cuisine sur le type, puis le nom, puis la description", () => {
    const byCuisine = cuisineAffinity(restaurant({ id: "a", name: "Chez Anna", cuisine_type: "Pizzeria" }), ["pizza"]);
    const byName = cuisineAffinity(restaurant({ id: "b", name: "Pizza Anna", cuisine_type: "Italien" }), ["pizza"]);
    const byDescription = cuisineAffinity(
      restaurant({ id: "c", name: "Anna", cuisine_type: "Bistrot", description: "Nos pizzas au feu de bois" }),
      ["pizza"],
    );
    expect(byCuisine).toBeGreaterThan(byName);
    expect(byName).toBeGreaterThan(byDescription);
    expect(cuisineAffinity(restaurant({ id: "d", name: "Anna" }), ["pizza"])).toBe(0);
  });

  it("classe une adresse pertinente et bien notée devant une adresse hors sujet", () => {
    const match = scoreDiscoveryCandidate(
      restaurant({ id: "a", name: "Vesuvio", cuisine_type: "Pizzeria", rating: 4.6, review_count: 300 }),
      ["pizza"],
    );
    const offTopic = scoreDiscoveryCandidate(
      restaurant({ id: "b", name: "Le Kebab", cuisine_type: "Kebab", rating: 4.6, review_count: 300 }),
      ["pizza"],
    );
    expect(match).toBeGreaterThan(offTopic);
  });
});

describe("TOK Connect discovery - sélection multi-cuisines", () => {
  const pizzerias: TokRestaurantRow[] = [
    restaurant({ id: "p1", name: "Vesuvio", cuisine_type: "Pizzeria", rating: 4.8, review_count: 412, price_range: 2, is_featured: true }),
    restaurant({ id: "p2", name: "Trattoria Carouge", cuisine_type: "Italien · Pizza", rating: 4.6, review_count: 268 }),
    restaurant({ id: "p3", name: "Forno Pâquis", cuisine_type: "Pizza", rating: 4.5, review_count: 191 }),
    restaurant({ id: "p4", name: "Pizza Express", cuisine_type: "Pizza", rating: 3.9, review_count: 42 }),
  ];
  const sushis: TokRestaurantRow[] = [
    restaurant({ id: "s1", name: "Sakura", cuisine_type: "Japonais · Sushi", rating: 4.9, review_count: 356 }),
    restaurant({ id: "s2", name: "Kaiten", cuisine_type: "Sushi", rating: 4.6, review_count: 224 }),
    restaurant({ id: "s3", name: "Maki Bar", cuisine_type: "Sushi", rating: 4.1, review_count: 61 }),
  ];

  const build = () => {
    const request = parseTokDiscoveryRequest("3 pizzerias et 2 restaurants de sushi à Genève");
    const selection = buildDiscoverySelection({
      request,
      rowsByIntent: [
        { intent: request.intents[0], rows: pizzerias },
        { intent: request.intents[1], rows: sushis },
      ],
      origin: "https://www.thetok.ch",
    });
    return { request, selection };
  };

  it("rend exactement 3 pizzerias et 2 sushis, les mieux notés", () => {
    const { selection } = build();
    expect(selection.cards).toHaveLength(5);
    const byGroup = selection.cards.reduce<Record<string, string[]>>((acc, card) => {
      acc[card.group_key] = [...(acc[card.group_key] || []), card.id];
      return acc;
    }, {});
    expect(byGroup.pizza).toEqual(expect.arrayContaining(["p1", "p2", "p3"]));
    expect(byGroup.pizza).toHaveLength(3);
    expect(byGroup.sushi).toEqual(["s1", "s2"]);
    expect(selection.cards.map((card) => card.id)).not.toContain("p4");
    expect(selection.notes).toEqual([]);
  });

  it("numérote les cartes du meilleur au moins bon et expose une fiche cliquable", () => {
    const { selection } = build();
    expect(selection.cards[0].rank).toBe(1);
    expect(selection.cards.map((card) => card.rank)).toEqual([1, 2, 3, 4, 5]);
    // p1 : 4,8/5 sur 412 avis et coup de cœur TOK, devant s1 (4,9 sur 356).
    expect(selection.cards[0].id).toBe("p1");
    expect(selection.cards[0].url).toBe("https://www.thetok.ch/restaurant/p1");
    expect(selection.cards[0].match_reason).toContain("Sélectionné pour");
    expect(selection.cards[0].badges.map((badge) => badge.label)).toContain("Top noté");
  });

  it("ne propose jamais deux fois la même adresse entre deux groupes", () => {
    const request = parseTokDiscoveryRequest("2 italiens et 2 pizzerias à Genève");
    const selection = buildDiscoverySelection({
      request,
      rowsByIntent: request.intents.map((intent) => ({ intent, rows: pizzerias })),
    });
    const ids = selection.cards.map((card) => card.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("signale et complète une catégorie sans adresse disponible", () => {
    const request = parseTokDiscoveryRequest("3 pizzerias et 2 sushis à Genève");
    const selection = buildDiscoverySelection({
      request,
      rowsByIntent: [
        { intent: request.intents[0], rows: pizzerias },
        { intent: request.intents[1], rows: [] },
      ],
      fallbackRows: pizzerias,
    });
    expect(selection.groups[1].delivered).toBe(0);
    expect(selection.notes[0]).toContain("Aucune adresse sushi");
    expect(selection.cards).toHaveLength(4);
    expect(selection.cards.some((card) => card.match_reason.includes("Complément"))).toBe(true);
  });

  it("résume la sélection en français lisible", () => {
    const { selection, request } = build();
    expect(describeDiscoverySelection(selection.groups, request.city)).toBe(
      "3 pizzerias et 2 restaurants de sushi à Genève",
    );
  });

  it("construit une charge utile prête pour le module ChatGPT", () => {
    const { selection, request } = build();
    const payload = buildDiscoveryPayload({
      request,
      cards: selection.cards,
      groups: selection.groups,
      notes: selection.notes,
      origin: "https://www.thetok.ch",
    });
    expect(payload.kind).toBe("restaurant_selection");
    expect(payload.title).toBe("3 pizzerias et 2 restaurants de sushi à Genève");
    expect(payload.restaurants).toHaveLength(5);
    expect(payload.delivered_total).toBe(5);
    expect(payload.requested_total).toBe(5);
    expect(payload.deep_link).toBe("https://www.thetok.ch/restaurants?city=Gen%C3%A8ve");
  });
});

describe("TOK Connect discovery - fiche restaurant", () => {
  it("normalise les horaires et met en avant le jour courant", () => {
    const hours = normalizeOpeningHours({
      monday: { open: "11:30", close: "14:00" },
      tuesday: "11:30 - 22:00",
      wednesday: { closed: true },
    });
    expect(hours).toEqual([
      { day: "Lundi", hours: "11:30 – 14:00" },
      { day: "Mardi", hours: "11:30 - 22:00" },
      { day: "Mercredi", hours: "Fermé" },
    ]);
  });

  it("assemble présentation, carte et créneaux dans une fiche unique", () => {
    const detail = mapRestaurantToDetail(
      restaurant({
        id: "s1",
        name: "Sakura",
        cuisine_type: "Sushi",
        rating: 4.9,
        review_count: 356,
        price_range: 3,
        phone: "+41 22 000 00 00",
        amenities: ["Terrasse", "Sans gluten"],
        opening_hours: { tuesday: { open: "12:00", close: "23:00" } },
      }),
      {
        origin: "https://www.thetok.ch",
        menuItems: [{ id: "m1", name: "Omakase", price: 89, currency: "CHF", description: "12 pièces du chef" }],
        availability: {
          date: "2026-09-09",
          slots: [
            { slot_time: "19:30:00", service: "dinner", remaining_tables: 2, available: true },
            { slot_time: "21:00", service: "dinner", remaining_tables: 0, available: false },
          ],
        },
        now: new Date("2026-09-08T10:00:00.000Z"),
      },
    );

    expect(detail.kind).toBe("restaurant_detail");
    expect(detail.menu_highlights[0]).toMatchObject({ name: "Omakase", price: 89, currency: "CHF" });
    expect(detail.availability.slots.map((slot) => slot.time)).toEqual(["19:30", "21:00"]);
    expect(detail.availability.slots[1].available).toBe(false);
    expect(detail.amenities).toEqual(["Terrasse", "Sans gluten"]);
    expect(detail.map_url).toContain("google.com/maps");
    expect(detail.reservation_hint).toContain("Réservation TOK disponible");
  });

  it("ignore une image qui n'est pas une URL http(s)", () => {
    const card = mapRestaurantToCard(restaurant({ id: "x", name: "Test", image_url: "javascript:alert(1)" }));
    expect(card.image_url).toBeNull();
  });
});

describe("TOK Connect discovery - ressource UI du module ChatGPT", () => {
  it("expose une ressource MCP Apps servie en HTML", () => {
    const descriptor = buildTokDiscoveryResourceDescriptor("https://www.thetok.ch");
    expect(descriptor.uri).toBe(TOK_DISCOVERY_RESOURCE_URI);
    expect(descriptor.mimeType).toBe("text/html;profile=mcp-app");
    expect(descriptor._meta["openai/widgetCSP"].resource_domains).toContain("https://www.thetok.ch");

    const contents = buildTokDiscoveryResourceContents("https://www.thetok.ch");
    expect(contents.text).toBe(TOK_DISCOVERY_WIDGET_HTML);
    expect(contents.text.startsWith("<!doctype html>")).toBe(true);
  });

  it("branche les outils sur le gabarit de sortie attendu par ChatGPT", () => {
    const meta = buildTokDiscoveryToolMeta({ invoking: "…", invoked: "ok" });
    expect(meta["openai/outputTemplate"]).toBe(TOK_DISCOVERY_RESOURCE_URI);
    expect(meta["openai/widgetAccessible"]).toBe(true);
    expect(meta.ui).toEqual({ resourceUri: TOK_DISCOVERY_RESOURCE_URI, visibility: ["model", "app"] });
  });

  it("rend les cartes et la fiche sans injection HTML ni dépendance externe", () => {
    expect(TOK_DISCOVERY_WIDGET_HTML).not.toContain("innerHTML");
    expect(TOK_DISCOVERY_WIDGET_HTML).not.toContain("<script src");
    expect(TOK_DISCOVERY_WIDGET_HTML).not.toContain("fetch(");
    expect(TOK_DISCOVERY_WIDGET_HTML).toContain("window.openai");
    expect(TOK_DISCOVERY_WIDGET_HTML).toContain("get_restaurant_details");
    expect(TOK_DISCOVERY_WIDGET_HTML).toContain("openai:set_globals");
    expect(TOK_DISCOVERY_WIDGET_HTML).toContain("requestDisplayMode");
    expect(TOK_DISCOVERY_WIDGET_HTML).toContain("sendFollowUpMessage");
    expect(TOK_DISCOVERY_WIDGET_HTML).toContain("setWidgetState");
  });
});

describe("TOK Connect discovery - câblage des Edge Functions", () => {
  const canonical = read("supabase/functions/tok-connect-mcp/index.ts");
  const gateway = read("supabase/functions/tok-connect-chatgpt/index.ts");
  const remote = read("supabase/functions/tok-connect-remote-mcp/index.ts");

  it("publie les outils de découverte sur le MCP canonique", () => {
    expect(canonical).toContain('name: "discover_restaurants"');
    expect(canonical).toContain('name: "get_restaurant_details"');
    expect(canonical).toContain("TOK_CONNECT_DISCOVERY_TOOL");
    expect(canonical).toContain("buildTokDiscoveryResourceDescriptor(TOK_CONNECT_PUBLIC_ORIGIN)");
    expect(canonical).toContain("buildTokDiscoveryResourceContents(TOK_CONNECT_PUBLIC_ORIGIN)");
  });

  it("ouvre le module TOK depuis la passerelle ChatGPT", () => {
    expect(gateway).toContain("tok-connect-discovery-widget.ts");
    expect(gateway).toContain("DISCOVERY_UI_META");
    expect(gateway).toContain('name: "discover_restaurants"');
    expect(gateway).toContain("TOK_DISCOVERY_RESOURCE_URI");
  });

  it("indique au modèle d'utiliser la découverte pour une demande de restaurants", () => {
    expect(remote).toContain("discover_restaurants");
    expect(gateway).toContain("discover_restaurants with their request verbatim");
  });

  it("n'envoie pas les outils du module vers la fixture sandbox historique", () => {
    expect(canonical).toContain("rendersDiscoveryModule");
    expect(canonical).toContain('context.environment === "sandbox" && !rendersDiscoveryModule');
  });

  it("laisse remonter la demande de connexion TOK depuis la recherche passerelle", () => {
    expect(gateway).toContain("if (result?.isError === true || !result?.structuredContent) return internal.json;");
  });
});

/* Faux client PostgREST : rejoue les filtres réellement envoyés par l'outil. */
type FakeCall = { table: string; filters: string[]; or: string[]; limit: number | null };

function fakeClient(tables: Record<string, TokRestaurantRow[] | Array<Record<string, unknown>>>) {
  const calls: FakeCall[] = [];
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];

  const build = (table: string) => {
    const call: FakeCall = { table, filters: [], or: [], limit: null };
    calls.push(call);
    const rows = () => {
      let data = [...((tables[table] || []) as Array<Record<string, unknown>>)];
      for (const filter of call.filters) {
        const [column, value] = filter.split("=");
        data = data.filter((row) => {
          if (column === "is_active" || column === "is_available") return row[column] !== false;
          if (value.startsWith("%")) {
            const needle = value.replace(/%/g, "").toLowerCase();
            return String(row[column] ?? "").toLowerCase().includes(needle);
          }
          return String(row[column] ?? "") === value;
        });
      }
      if (call.or.length) {
        const clauses = call.or.join(",").split(",");
        data = data.filter((row) => clauses.some((clause) => {
          const [column, , pattern] = clause.split(".");
          const needle = (pattern || "").replace(/\*/g, "").toLowerCase();
          return needle ? String(row[column] ?? "").toLowerCase().includes(needle) : false;
        }));
      }
      return call.limit === null ? data : data.slice(0, call.limit);
    };

    const query: Record<string, unknown> = {
      select: () => query,
      order: () => query,
      eq: (column: string, value: unknown) => { call.filters.push(`${column}=${String(value)}`); return query; },
      ilike: (column: string, pattern: string) => { call.filters.push(`${column}=${pattern}`); return query; },
      or: (filter: string) => { call.or.push(filter); return query; },
      limit: (count: number) => { call.limit = count; return query; },
      maybeSingle: () => Promise.resolve({ data: rows()[0] ?? null, error: null }),
      then: (resolve: (value: { data: unknown; error: null }) => unknown) => Promise.resolve({ data: rows(), error: null }).then(resolve),
    };
    return query;
  };

  const client = {
    from: (table: string) => build(table),
    rpc: (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      return Promise.resolve({
        data: [
          { slot_time: "19:30", service: "dinner", remaining_tables: 3, available: true },
          { slot_time: "21:00", service: "dinner", remaining_tables: 0, available: false },
        ],
        error: null,
      });
    },
  } as unknown as TokDiscoveryClient;

  return { client, calls, rpcCalls };
}

const CATALOG: TokRestaurantRow[] = [
  restaurant({ id: "p1", name: "Vesuvio", cuisine_type: "Pizzeria napolitaine", rating: 4.8, review_count: 412, price_range: 2, is_featured: true, image_url: "https://cdn.thetok.ch/p1.jpg" }),
  restaurant({ id: "p2", name: "Trattoria Carouge", cuisine_type: "Italien", description: "Pizzas au feu de bois", rating: 4.6, review_count: 268 }),
  restaurant({ id: "p3", name: "Forno Pâquis", cuisine_type: "Pizzeria", rating: 4.5, review_count: 191 }),
  restaurant({ id: "p4", name: "Pizza Express", cuisine_type: "Pizzeria", rating: 3.7, review_count: 30 }),
  restaurant({ id: "s1", name: "Sakura", cuisine_type: "Japonais sushi", rating: 4.9, review_count: 356, price_range: 3 }),
  restaurant({ id: "s2", name: "Kaiten", cuisine_type: "Sushi bar", rating: 4.6, review_count: 224 }),
  restaurant({ id: "s3", name: "Maki Bar", cuisine_type: "Sushi", rating: 4.1, review_count: 61 }),
  restaurant({ id: "b1", name: "Le Grand Bistrot", cuisine_type: "Brasserie", rating: 4.7, review_count: 520 }),
  restaurant({ id: "l1", name: "Lausanne Pizza", cuisine_type: "Pizzeria", city: "Lausanne", rating: 4.9, review_count: 900 }),
];

describe("TOK Connect discovery - exécution de l'outil discover_restaurants", () => {
  const args = { request: "fais-moi une sélection de 3 pizzeria et deux restaurant de sushi à Genève" };

  it("répond exactement à « 3 pizzerias et 2 sushis à Genève »", async () => {
    const { client } = fakeClient({ restaurants: CATALOG });
    const payload = await runTokDiscovery({ client, args, origin: "https://www.thetok.ch" });

    expect(payload.restaurants).toHaveLength(5);
    expect(payload.city).toBe("Genève");
    expect(payload.title).toBe("3 pizzerias et 2 restaurants de sushi à Genève");
    const groups = payload.restaurants.map((card) => card.group_key);
    expect(groups.filter((key) => key === "pizza")).toHaveLength(3);
    expect(groups.filter((key) => key === "sushi")).toHaveLength(2);
  });

  it("ne retient que les mieux notés et jamais une autre ville", async () => {
    const { client } = fakeClient({ restaurants: CATALOG });
    const payload = await runTokDiscovery({ client, args, origin: "https://www.thetok.ch" });
    const ids = payload.restaurants.map((card) => card.id);

    expect(ids).toEqual(expect.arrayContaining(["p1", "p2", "p3", "s1", "s2"]));
    expect(ids).not.toContain("p4");
    expect(ids).not.toContain("l1");
    expect(ids).not.toContain("b1");
  });

  it("filtre en base sur la ville, l'activité et le radical de cuisine", async () => {
    const { client, calls } = fakeClient({ restaurants: CATALOG });
    await runTokDiscovery({ client, args, origin: "https://www.thetok.ch" });

    expect(calls.every((call) => call.filters.includes("is_active=true"))).toBe(true);
    expect(calls.every((call) => call.filters.includes("city=%Genève%"))).toBe(true);
    expect(calls[0].or.join(",")).toContain("cuisine_type.ilike.*pizz*");
    expect(calls[1].or.join(",")).toContain("cuisine_type.ilike.*sush*");
  });

  it("respecte une limite explicite en répartissant les groupes", async () => {
    const { client } = fakeClient({ restaurants: CATALOG });
    const payload = await runTokDiscovery({ client, args: { ...args, limit: 3 }, origin: "https://www.thetok.ch" });
    expect(payload.restaurants.length).toBeLessThanOrEqual(3);
    expect(new Set(payload.restaurants.map((card) => card.group_key)).size).toBe(2);
  });

  it("accepte une répartition explicite du modèle", async () => {
    const { client } = fakeClient({ restaurants: CATALOG });
    const payload = await runTokDiscovery({
      client,
      args: { request: "des adresses à Genève", selections: [{ cuisine: "sushi", count: 2 }] },
      origin: "https://www.thetok.ch",
    });
    expect(payload.restaurants.map((card) => card.id)).toEqual(["s1", "s2"]);
  });

  it("complète et signale une catégorie vide plutôt que de rendre une liste courte", async () => {
    const { client } = fakeClient({ restaurants: CATALOG.filter((row) => !String(row.cuisine_type).toLowerCase().includes("sush")) });
    const payload = await runTokDiscovery({ client, args, origin: "https://www.thetok.ch" });
    expect(payload.notes.join(" ")).toContain("Aucune adresse sushi");
    expect(payload.restaurants.length).toBeGreaterThanOrEqual(3);
  });

  it("ne garde que les adresses réservables quand c'est demandé", async () => {
    const catalog = CATALOG.map((row) => (row.id === "p1" ? { ...row, supports_reservation: false } : row));
    const { client, calls } = fakeClient({ restaurants: catalog });
    const payload = await runTokDiscovery({ client, args: { ...args, requires_reservation: true }, origin: "https://www.thetok.ch" });
    expect(calls.every((call) => call.filters.includes("supports_reservation=true"))).toBe(true);
    expect(payload.restaurants.map((card) => card.id)).not.toContain("p1");
  });

  it("remonte une erreur base explicite plutôt qu'une liste vide", async () => {
    const client = {
      from: () => {
        const query: Record<string, unknown> = {
          select: () => query, eq: () => query, ilike: () => query, or: () => query,
          order: () => query, limit: () => query, maybeSingle: () => Promise.resolve({ data: null, error: null }),
          then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: null, error: { message: "boom" } }).then(resolve),
        };
        return query;
      },
      rpc: () => Promise.resolve({ data: null, error: null }),
    } as unknown as TokDiscoveryClient;

    await expect(runTokDiscovery({ client, args })).rejects.toBeInstanceOf(TokDiscoveryError);
  });

  it("borne une répartition trop large sans vider un groupe", () => {
    const request = parseTokDiscoveryRequest("6 pizzerias et 4 sushis à Genève");
    const scaled = scaleDiscoveryIntents(request.intents, 5);
    expect(scaled.reduce((total, intent) => total + intent.count, 0)).toBeLessThanOrEqual(5);
    expect(scaled.every((intent) => intent.count >= 1)).toBe(true);
  });

  it("neutralise les séparateurs PostgREST dans un terme libre", () => {
    expect(buildDiscoveryOrFilter(["piz,za)"])).toBe(
      "cuisine_type.ilike.*piz za*,name.ilike.*piz za*,description.ilike.*piz za*",
    );
    expect(buildDiscoveryOrFilter(["ab"])).toBeNull();
  });
});

describe("TOK Connect discovery - exécution de l'outil get_restaurant_details", () => {
  it("assemble la fiche complète avec carte et créneaux", async () => {
    const { client, rpcCalls } = fakeClient({
      restaurants: CATALOG,
      menu_items: [
        { id: "m1", name: "Margherita", price: 21, is_available: true, restaurant_id: "p1" },
        { id: "m2", name: "Tiramisu", price: 11, is_available: true, restaurant_id: "p1" },
      ],
    });

    const detail = await runTokRestaurantDetail({
      client,
      args: { restaurant_id: "p1", date: "2026-09-09" },
      origin: "https://www.thetok.ch",
    });

    expect(detail.id).toBe("p1");
    expect(detail.kind).toBe("restaurant_detail");
    expect(detail.menu_highlights.map((item) => item.name)).toEqual(["Margherita", "Tiramisu"]);
    expect(detail.availability.date).toBe("2026-09-09");
    expect(detail.availability.slots.map((slot) => slot.time)).toEqual(["19:30", "21:00"]);
    expect(rpcCalls[0].name).toBe("get_restaurant_reservation_slot_availability");
    expect(detail.url).toBe("https://www.thetok.ch/restaurant/p1");
  });

  it("n'interroge pas les créneaux pour une adresse non réservable", async () => {
    const catalog = CATALOG.map((row) => (row.id === "p1" ? { ...row, supports_reservation: false } : row));
    const { client, rpcCalls } = fakeClient({ restaurants: catalog, menu_items: [] });
    const detail = await runTokRestaurantDetail({ client, args: { restaurant_id: "p1" } });
    expect(rpcCalls).toHaveLength(0);
    expect(detail.availability.slots).toEqual([]);
    expect(detail.reservation_hint).toContain("ne prend pas encore de réservation");
  });

  it("répond 404 pour une adresse inconnue et 400 sans identifiant", async () => {
    const { client } = fakeClient({ restaurants: CATALOG });
    await expect(runTokRestaurantDetail({ client, args: { restaurant_id: "inconnu" } }))
      .rejects.toMatchObject({ status: 404 });
    await expect(runTokRestaurantDetail({ client, args: {} }))
      .rejects.toMatchObject({ status: 400 });
  });
});

describe("TOK Connect discovery - environnement sandbox", () => {
  it("rend une démonstration crédible sans base de données", () => {
    const payload = buildSandboxDiscoveryPayload(
      { request: "3 pizzerias et 2 sushis à Genève" },
      "https://www.thetok.ch",
    );
    expect(payload.restaurants).toHaveLength(5);
    expect(payload.notes.join(" ")).toContain("sandbox");
    expect(payload.restaurants.filter((card) => card.group_key === "pizza")).toHaveLength(3);
    expect(payload.restaurants.filter((card) => card.group_key === "sushi")).toHaveLength(2);
  });
});
