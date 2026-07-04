import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function read(relativePath: string) {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

describe("client checkout session guards", () => {
  it("routes basket checkout creation through the fresh-session Edge Function helper", () => {
    const source = read("src/pages/Panier.tsx");

    expect(source).toContain("invokeSupabaseFunction<CreateCheckoutFunctionResponse>(\"create-checkout\"");
    expect(source).not.toContain("supabase.functions.invoke(\"create-checkout\"");
  });

  it("routes Zero Attente checkout and recovery through the fresh-session Edge Function helper", () => {
    const source = read("src/pages/ZeroAttente.tsx");

    expect(source).toMatch(/invokeSupabaseFunction[\s\S]*?\("create-checkout"/);
    expect(source).toMatch(/invokeSupabaseFunction[\s\S]*?\("create-zero-attente-reservation"/);
    expect(source).not.toContain("supabase.functions.invoke(\"create-checkout\"");
    expect(source).not.toContain("supabase.functions.invoke(\"create-zero-attente-reservation\"");
  });

  it("routes Table du Chef recovery through the fresh-session Edge Function helper", () => {
    const source = read("src/pages/ChefsTable.tsx");

    expect(source).toMatch(/invokeSupabaseFunction[\s\S]*?\("create-chefs-table-reservation"/);
    expect(source).not.toContain("supabase.functions.invoke(\"create-chefs-table-reservation\"");
  });
});
