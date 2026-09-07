from pathlib import Path
import re

path = Path("src/test/deploy-production-secret-scope.test.ts")
text = path.read_text()
pattern = re.compile(
    r'  it\("scopes the dedicated demo to server AI and a Stripe Test secret only", \(\) => \{.*?\n  \}\);',
    re.S,
)
replacement = '''  it("scopes the dedicated demo to server AI and a Stripe Test secret only", () => {
    const demoSecretNames = secretEnvironmentNames(prepareDemoSecrets);
    for (const name of [
      "FIRECRAWL_API_KEY",
      "OPENAI_API_KEY",
      "SUPABASE_ACCESS_TOKEN",
    ]) {
      expect(demoSecretNames).toContain(name);
    }
    // Stripe Test is intentionally not re-exposed in this step's environment.
    // The demo writer reads it from the mode-0600 provider env produced earlier.
    expect(demoSecretNames).not.toContain("STRIPE_SECRET_KEY_TEST");
    expect(demoSecretNames).not.toContain("STRIPE_SECRET_KEY_LIVE");
    expect(demoSecretNames).not.toContain("STRIPE_PERSONNAL_SECRET_KEY");
    expect(secretEnvironmentNames(configureDemoAuth)).toEqual(["SUPABASE_ACCESS_TOKEN"]);
    expect(demoSecretWriter).toContain('path.join(requireEnvironmentPath("RUNNER_TEMP"), "supabase.functions.env")');
    expect(demoSecretWriter).toContain('readPrivateEnvValue(providerSource, "STRIPE_SECRET_KEY_TEST")');
    expect(demoSecretWriter).toContain('startsWith("sk_test_")');
    expect(demoSecretWriter).toContain('["STRIPE_SECRET_KEY_TEST", stripeTest]');
    expect(demoSecretWriter).toContain('["DEMO_PAYMENT_MODE", "stripe_test"]');
    expect(demoSecretWriter).not.toContain("STRIPE_SECRET_KEY_LIVE");
    expect(prepareDemoSecrets).not.toContain("STRIPE_SECRET_KEY_TEST");
    expect(workflow).toContain("write-supabase-secrets-env.mjs --out=${RUNNER_TEMP}/supabase.functions.env");
    expect(workflow).toContain("write-commercial-demo-secrets-env.mjs");
  });'''
text, count = pattern.subn(replacement, text, count=1)
if count != 1:
    raise RuntimeError(f"expected one generated demo secret-scope test, found {count}")
path.write_text(text)
print("Aligned demo secret-scope contract with private provider-file handoff.")
