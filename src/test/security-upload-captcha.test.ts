import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("security upload and captcha hardening", () => {
  it("adds Turnstile CAPTCHA tokens to password auth and public contact forms", () => {
    const captcha = read("src/components/security/TurnstileCaptcha.tsx");
    const captchaConfig = read("src/lib/captcha.ts");
    const auth = read("src/pages/Auth.tsx");
    const contact = read("src/pages/Contact.tsx");

    expect(captchaConfig).toContain("VITE_TURNSTILE_SITE_KEY");
    expect(captchaConfig).toContain("isCaptchaEnabled");
    expect(captcha).toContain("https://challenges.cloudflare.com/turnstile/v0/api.js");
    expect(auth).toContain("captchaToken");
    expect(auth).toContain("signInWithPassword");
    expect(auth).toContain("signUp");
    expect(auth).toContain("resetPasswordForEmail");
    expect(contact).toContain("TurnstileCaptcha");
    expect(contact).toContain("public_contact");
  });

  it("blocks dangerous uploads before Supabase Storage writes", () => {
    const security = read("src/lib/uploadSecurity.ts");
    const imageUpload = read("src/components/ImageUpload.tsx");
    const signup = read("src/lib/signup.ts");
    const catalog = read("src/pages/admin/AdminCatalog.tsx");
    const social = read("src/hooks/useSocialFeed.ts");
    const invoice = read("src/pages/dashboard/DashboardInvoiceSettings.tsx");

    expect(security).toContain("DANGEROUS_EXTENSIONS");
    expect(security).toContain('"application/pdf": "pdf"');
    expect(security).toContain('"video/mp4": "mp4"');
    for (const source of [imageUpload, signup, catalog, social, invoice]) {
      expect(source).toContain("assertSafeFileUpload");
      expect(source.indexOf("assertSafeFileUpload")).toBeLessThan(source.indexOf(".upload("));
    }
  });
});
