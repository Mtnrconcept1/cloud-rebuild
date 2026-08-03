import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const template = readFileSync(
  resolve(process.cwd(), "supabase/functions/_shared/marketing-email-template.ts"),
  "utf8",
);
const example = readFileSync(
  resolve(process.cwd(), "docs/marketing-email-examples/01-lancement-geneve.html"),
  "utf8",
);

describe("TOK email shell", () => {
  it("uses the layout primitives email clients actually support", () => {
    // Outlook renders through Word: flexbox and grid collapse, tables do not.
    expect(template).toContain('role="presentation"');
    expect(template).toContain('width="600"');
    expect(template).not.toContain("display:flex");
    expect(template).not.toContain("display:grid");
  });

  it("carries the real TOK assets", () => {
    expect(template).toContain("/logo3df.png");
    expect(template).toContain("/chef.png");
  });

  it("escapes every operator- and model-authored string", () => {
    expect(template).toContain("escapeHtml(content.headline)");
    expect(template).toContain("escapeHtml(brand.senderName)");
    expect(template).toContain("escapeHtml(cta)");
  });

  it("refuses any URL that is not absolute https", () => {
    expect(template).toContain("/^https:\\/\\/[^\\s\"'<>]+$/.test(trimmed)");
  });

  it("ships a preheader so the inbox preview is not the logo alt text", () => {
    expect(template).toContain("display:none;max-height:0;overflow:hidden");
  });

  it("always produces a plain-text alternative", () => {
    // A message with no text part is itself a spam signal.
    expect(template).toContain("return { html, text };");
  });

  it("shows a visible unsubscribe link, not only the header", () => {
    expect(template).toContain("Se désabonner en un clic");
    expect(template).toContain("brand.senderAddress");
  });
});

describe("example drafts", () => {
  it("render the branded shell end to end", () => {
    expect(example).toContain("<!doctype html>");
    expect(example).toContain("https://www.thetok.ch/logo3df.png");
    expect(example).toContain("https://www.thetok.ch/chef.png");
    expect(example).toContain('width="600"');
  });

  it("stay within the size that keeps Gmail from clipping the message", () => {
    // Gmail truncates past ~102 kB and hides the unsubscribe link with it.
    expect(example.length).toBeLessThan(102_000);
  });

  it("include the unsubscribe affordance in the rendered output", () => {
    expect(example).toContain("marketing-unsubscribe?token=");
  });
});
