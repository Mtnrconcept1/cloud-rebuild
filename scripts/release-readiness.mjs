import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { inspectReleaseReadiness } from "./release-readiness-core.mjs";
import { resolveLiveStripePublishableKey } from "./resolve-live-stripe-publishable-key.mjs";

export { inspectReleaseReadiness };

function printResult(result) {
  console.log("Release readiness");
  console.log("=================");
  console.log(`Mode: ${result.strict ? "strict" : "advisory"}`);
  console.log(`Target: ${result.target}`);
  console.log(`Result: ${result.ok ? "OK" : "FAIL"}`);

  for (const error of result.errors) {
    console.log(`- ${error}`);
  }

  for (const warning of result.warnings) {
    console.log(`- Warning: ${warning}`);
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  const args = process.argv.slice(2);
  const strict = args.includes("--strict") ? true : undefined;
  const targetArgument = args.find((argument) => argument.startsWith("--target="));
  const target = targetArgument ? targetArgument.slice("--target=".length) : undefined;

  let resolvedStripeKey = "";
  let resolvedSource = "";

  try {
    const resolved = await resolveLiveStripePublishableKey();
    resolvedStripeKey = resolved.value;
    resolvedSource = resolved.source;
  } catch (error) {
    console.warn(
      error instanceof Error
        ? error.message
        : "Unable to resolve the live Stripe publishable key.",
    );
  }

  if (resolvedSource && resolvedSource !== "environment") {
    console.log(`Resolved Stripe publishable key from ${resolvedSource}; value remains masked.`);
  }

  const result = inspectReleaseReadiness({
    strict,
    target,
    env: {
      ...process.env,
      ...(resolvedStripeKey
        ? { VITE_STRIPE_PUBLISHABLE_KEY: resolvedStripeKey }
        : {}),
    },
  });

  printResult(result);
  process.exit(result.ok ? 0 : 1);
}
