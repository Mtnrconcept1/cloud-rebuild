import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const migration = readFileSync(
  join(root, "supabase/migrations/20261104123920_newsletter_signup_consent_reward.sql"),
  "utf8",
);
const auth = readFileSync(join(root, "src/pages/Auth.tsx"), "utf8");
const hero = readFileSync(join(root, "src/components/home/HeroSection.tsx"), "utf8");

describe("TOK newsletter signup and welcome reward", () => {
  it("routes the public CTA into a client signup, never implicit newsletter consent", () => {
    expect(hero).toContain('to="/auth?newsletter=1"');
    expect(auth).toContain('searchParams.get("newsletter") === "1"');
    expect(auth).toContain('!newsletterOffer');
    expect(auth).toContain('id="newsletter-opt-in"');
    expect(auth).toContain("const [newsletterConsentDraft, setNewsletterConsentDraft] = useState(false)");
    expect(auth).toContain('newsletter_opt_in: true');
    expect(auth).toContain('newsletter_source: newsletterOffer ? "home_offer" : "signup"');
    expect(auth).toContain('submittedRole === "client" && newsletterConsentDraft');
  });

  it("requires email verification before enabling marketing and rewarding Miamz", () => {
    expect(migration).toContain("NEW.email_confirmed_at IS NOT NULL");
    expect(migration).toContain("OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL");
    expect(migration).toContain("email_confirmed_at IS NOT NULL");
    expect(migration).toContain("welcome_eligible AND v_subscription.welcome_awarded_at IS NULL");
    expect(migration).toContain("500, 'newsletter_welcome'");
    expect(migration).toContain("SET loyalty_points = COALESCE(loyalty_points, 0) + 500");
  });

  it("makes welcome rewards idempotent and denies unauthenticated subscription changes", () => {
    expect(migration).toContain("CREATE UNIQUE INDEX loyalty_newsletter_welcome_once_per_user");
    expect(migration).toContain("ON CONFLICT DO NOTHING");
    expect(migration).toContain("FOR UPDATE");
    expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("USING (user_id = (SELECT auth.uid()))");
    expect(migration).toContain("GRANT SELECT ON public.newsletter_subscriptions TO authenticated");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.subscribe_tok_newsletter() FROM PUBLIC, anon");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.subscribe_tok_newsletter() TO authenticated");
    expect(migration).toContain("consent_source = 'existing_account'");
    expect(migration).toContain("welcome_eligible");
  });

  it("connects unsubscribing through profile preferences to actual marketing suppression", () => {
    expect(migration).toContain("AFTER UPDATE OF categories ON public.notification_preferences");
    expect(migration).toContain("SET unsubscribed_at = COALESCE(unsubscribed_at, now())");
    expect(migration).toContain("IF NOT v_new THEN");
    expect(migration).toContain('categories,');
    expect(migration).toContain("'marketing'");
  });
});
