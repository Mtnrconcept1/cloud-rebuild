import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import * as evidence from "../../supabase/functions/_shared/restaurant-cover-evidence";

const sourceUrl = "https://restaurant.example/notre-maison";
const originalUrl = "https://restaurant.example/media/terrasse.png";
const projectUrl = "https://tok.example.supabase.co";
const storageUrl = `${projectUrl}/storage/v1/object/public/restaurant-images/cover.png`;
const row = {
  review_id: "review-1", lease_token: "lease-1", restaurant_id: "restaurant-1",
  restaurant_name: "Chez Test", restaurant_address: "Rue du Test 8", restaurant_city: "Genève",
  candidate_url: originalUrl, source_url: sourceUrl, directory_source: "official", attempt_number: 1,
};
const identity = { name: row.restaurant_name, address: row.restaurant_address, city: row.restaurant_city };
const rawSource = readFileSync("supabase/functions/verify-directory-image-truth/index.ts", "utf8");
const compiledSource = ts.transpileModule(rawSource.replace(/^import[\s\S]*?;\r?\n/gm, ""), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;
type Decision = { decision: string; reason: string; imageKind: string; evidence: Record<string, unknown> };

function png(lastByte = 0) {
  const bytes = new Uint8Array(16_000);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, 640);
  view.setUint32(20, 400);
  bytes[bytes.length - 1] = lastByte;
  return bytes;
}

function entity(image: unknown = originalUrl, overrides: Record<string, unknown> = {}) {
  return {
    "@type": "Restaurant", name: row.restaurant_name,
    address: { "@type": "PostalAddress", streetAddress: row.restaurant_address, addressLocality: row.restaurant_city },
    image, ...overrides,
  };
}

function page(data: unknown, footer = "") {
  return `<title>Chez Test Genève</title><main>Chez Test Rue du Test 8 Genève</main>
    <script type="application/ld+json">${JSON.stringify(data)}</script>${footer}`;
}

async function verify(options: {
  candidate?: string; html?: string; jobOriginal?: string;
  images?: Record<string, Uint8Array | { redirect: string }>;
} = {}) {
  const candidate = options.candidate || originalUrl;
  const requests: string[] = [];
  const images = { [candidate]: png(), ...(options.jobOriginal ? { [options.jobOriginal]: png() } : {}), ...options.images };
  const fetchFixture = async (input: URL | string) => {
    const url = String(input);
    requests.push(url);
    if (url === sourceUrl) return new Response(options.html ?? page(entity()), { headers: { "content-type": "text/html" } });
    const file = images[url];
    if (!file) throw new Error(`unexpected_fetch:${url}`);
    if (!(file instanceof Uint8Array)) return new Response(null, { status: 302, headers: { location: file.redirect } });
    const body = new Uint8Array(file).buffer;
    return new Response(body, { headers: { "content-type": "image/png" } });
  };
  const fakeDeno = {
    env: { get: (name: string) => name === "SUPABASE_URL" ? projectUrl : "" },
    resolveDns: async (_host: string, type: string) => type === "A" ? ["93.184.216.34"] : [],
    serve: () => undefined,
  };
  const names = Object.keys(evidence);
  const buildVerifier = new Function("Deno", "fetch", "crypto", ...names, `${compiledSource}\nreturn verifyOfficialSource;`);
  const verifier = buildVerifier(fakeDeno, fetchFixture, webcrypto, ...Object.values(evidence)) as
    (db: unknown, claim: typeof row) => Promise<Decision>;
  const supabase = {
    from: (table: string) => {
      type Query = { select: () => Query; eq: () => Query; limit: () => Query; maybeSingle: () => Promise<unknown> };
      const query: Query = {
        select: () => query, eq: () => query, limit: () => query,
        maybeSingle: async () => ({ data: table === "restaurant_directory_image_jobs"
          ? { source_page_url: sourceUrl, source_image_url: options.jobOriginal || null }
          : null, error: null }),
      };
      return query;
    },
  };
  return { result: await verifier(supabase, { ...row, candidate_url: candidate }), requests };
}

describe("restaurant cover evidence decisions", () => {
  it("requires image, exact name, street number and city on the same restaurant entity", async () => {
    const { result } = await verify();
    expect(result.decision).toBe("verified");
    expect(result.evidence.visual_review_performed).toBe(false);
    const wrongAddress = { streetAddress: "Rue du Test 80", addressLocality: "Genève" };
    expect((await verify({ html: page(entity(originalUrl, { address: wrongAddress })) })).result.decision).toBe("manual_review");
    expect((await verify({ html: page({ "@graph": [entity("/media/autre.png"), entity(originalUrl, { name: "Autre Restaurant" })] }) })).result.decision).toBe("manual_review");
  });

  it("does not approve another venue displayed in a same-host footer", async () => {
    const html = page(entity("/media/chez-test.png"), `<footer>Nos autres établissements<img src="${originalUrl}" alt="Les Aviateurs" /></footer>`);
    expect((await verify({ html })).result.decision).toBe("manual_review");
  });

  it("does not confuse identical filenames from different hosts", async () => {
    const candidate = "https://other.example/media/terrasse.png";
    expect((await verify({ candidate })).result.decision).toBe("manual_review");
  });

  it("accepts stored originals only for the configured bucket and identical image bytes", async () => {
    const matching = await verify({ candidate: storageUrl, jobOriginal: originalUrl });
    expect(matching.result.decision).toBe("verified");
    expect(matching.result.evidence.original_hash_matches).toBe(true);
    expect((await verify({ candidate: storageUrl, jobOriginal: originalUrl, images: { [originalUrl]: png(1) } })).result.decision).toBe("manual_review");
    for (const candidate of [storageUrl.replace("tok.example", "other.example"), storageUrl.replace("restaurant-images", "other-bucket")]) {
      expect((await verify({ candidate, jobOriginal: originalUrl })).result.decision).toBe("manual_review");
    }
  });

  it("ignores a stale job original when the candidate itself is linked", async () => {
    const stale = "https://restaurant.example/media/logo.png";
    const { result, requests } = await verify({ jobOriginal: stale });
    expect(result.decision).toBe("verified");
    expect(result.imageKind).toBe("terrace");
    expect(requests).not.toContain(stale);
  });

  it("rejects business cards and sends partner graphics to manual review", async () => {
    expect((await verify({ candidate: "https://restaurant.example/1-DSC00954_cartes_de_visite.JPG" })).result.decision).toBe("rejected");
    expect((await verify({ candidate: "https://restaurant.example/logoWhite.png" })).result.decision).toBe("rejected");
    expect((await verify({ candidate: "https://restaurant.example/partenaire-1.png" })).result.decision).toBe("manual_review");
    for (const filename of ["menuFront.png", "partenairePrincipal.png"]) {
      expect((await verify({ candidate: `https://restaurant.example/${filename}` })).result.decision).toBe("manual_review");
    }
  });

  it("checks redirected candidate and byte-linked original metadata", async () => {
    const logo = "https://restaurant.example/media/logo.png";
    expect((await verify({ images: { [originalUrl]: { redirect: logo }, [logo]: png() } })).result.decision).toBe("rejected");
    const partner = "https://restaurant.example/media/partenaire-1.png";
    expect((await verify({ candidate: storageUrl, jobOriginal: originalUrl,
      images: { [originalUrl]: { redirect: partner }, [partner]: png() } })).result.decision).toBe("manual_review");
    expect((await verify({ candidate: storageUrl, jobOriginal: logo, html: page(entity(logo)),
      images: { [logo]: png(1) } })).result.decision).toBe("manual_review");
  });

  it("does not infer a payment graphic from Cash or a menu from a directory name", async () => {
    for (const candidate of ["https://restaurant.example/AvecOuSansCash.png", "https://restaurant.example/menu/plat.png"]) {
      expect((await verify({ candidate, html: page(entity(candidate)) })).result.decision).toBe("verified");
    }
  });

  it("does not resolve an image node @id as a page image URL", async () => {
    const html = page(entity({ "@type": "ImageObject", "@id": "#primaryimage" }));
    expect(evidence.restaurantEntityImages(html, sourceUrl, identity)).toEqual([]);
    expect((await verify({ html })).result.decision).toBe("manual_review");
  });

  it("bounds nested image arrays and treats malformed JSON as no evidence", async () => {
    let nested: unknown = originalUrl;
    for (let depth = 0; depth < 8; depth += 1) nested = [nested];
    expect((await verify({ html: page(entity(nested)) })).result.decision).toBe("manual_review");
    const html = `<title>Chez Test Genève</title><main>Rue du Test 8</main><script type="application/ld+json">{invalid}</script>`;
    expect((await verify({ html })).result.decision).toBe("manual_review");
    expect(evidence.canonicalEvidenceUrl("https://user:password@restaurant.example/a.png")).toBeNull();
  });
});
