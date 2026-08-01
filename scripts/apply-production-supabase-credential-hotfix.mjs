import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const workflowPath = resolve(".github/workflows/deploy-production.yml");
let workflow = readFileSync(workflowPath, "utf8");

function replaceExactlyOnce(source, search, replacement, label) {
  const first = source.indexOf(search);
  if (first < 0) {
    throw new Error(`Unable to locate ${label}.`);
  }
  if (source.indexOf(search, first + search.length) >= 0) {
    throw new Error(`${label} is ambiguous.`);
  }
  return source.slice(0, first) + replacement + source.slice(first + search.length);
}

const productionTargetMarker = [
  "      - name: Assert production Supabase target",
  "        run: test \"$SUPABASE_PROJECT_REF\" = \"wwcrtyoueexyxkkikaos\"",
  "",
  "      - name: Assert server-only OpenAI secret",
].join("\n");

const productionTargetReplacement = [
  "      - name: Assert production Supabase target",
  "        run: test \"$SUPABASE_PROJECT_REF\" = \"wwcrtyoueexyxkkikaos\"",
  "",
  "      - name: Resolve production Supabase API keys",
  "        if: >-",
  "          ${{ needs.validation.outputs.deploy_functions == 'true' ||",
  "              needs.validation.outputs.sync_supabase_secrets == 'true' }}",
  "        shell: bash",
  "        env:",
  "          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}",
  "        run: |",
  "          set -euo pipefail",
  "          test -n \"$SUPABASE_ACCESS_TOKEN\" || (echo \"::error::Missing SUPABASE_ACCESS_TOKEN.\" && exit 1)",
  "          keys_file=\"${RUNNER_TEMP}/production-api-keys.json\"",
  "          trap 'rm -f -- \"$keys_file\"' EXIT",
  "          curl --fail --silent --show-error \\",
  "            --header \"Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}\" \\",
  "            \"https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/api-keys?reveal=true\" \\",
  "            --output \"$keys_file\"",
  "          chmod 600 \"$keys_file\"",
  "          node ./scripts/write-production-supabase-keys-env.mjs \\",
  "            --keys-file=\"$keys_file\" \\",
  "            --out=\"$GITHUB_ENV\"",
  "",
  "      - name: Assert server-only OpenAI secret",
].join("\n");

workflow = replaceExactlyOnce(
  workflow,
  productionTargetMarker,
  productionTargetReplacement,
  "production Supabase key resolution insertion point",
);

workflow = replaceExactlyOnce(
  workflow,
  [
    "          SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY }}",
    "          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}",
    "",
  ].join("\n"),
  "",
  "legacy GitHub Supabase secret bindings",
);

const deployStart = workflow.indexOf("\n  deploy_frontend:");
const deployEnd = workflow.indexOf("\n  attach_marketing_domain:", deployStart);
if (deployStart < 0 || deployEnd < 0) {
  throw new Error("Unable to isolate deploy_frontend job.");
}

let deployJob = workflow.slice(deployStart, deployEnd);

deployJob = replaceExactlyOnce(
  deployJob,
  [
    "      VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}",
    "      SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}",
    "      VITE_SUPABASE_URL: https://wwcrtyoueexyxkkikaos.supabase.co",
    "      VITE_SUPABASE_PUBLISHABLE_KEY: ${{ secrets.VITE_SUPABASE_PUBLISHABLE_KEY }}",
  ].join("\n"),
  [
    "      VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}",
    "      SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}",
  ].join("\n"),
  "deploy_frontend environment bindings",
);

deployJob = replaceExactlyOnce(
  deployJob,
  [
    "      - name: Enable pnpm",
    "        run: corepack enable && corepack prepare pnpm@${{ env.PNPM_VERSION }} --activate",
    "",
    "      - name: Download prebuilt Vercel output",
  ].join("\n"),
  [
    "      - name: Enable pnpm",
    "        run: corepack enable && corepack prepare pnpm@${{ env.PNPM_VERSION }} --activate",
    "",
    "      - name: Checkout deployment scripts",
    "        uses: actions/checkout@v6",
    "        with:",
    "          ref: ${{ github.sha }}",
    "          fetch-depth: 1",
    "",
    "      - name: Resolve production Supabase API keys for Vercel",
    "        shell: bash",
    "        run: |",
    "          set -euo pipefail",
    "          test -n \"$SUPABASE_ACCESS_TOKEN\" || (echo \"::error::Missing SUPABASE_ACCESS_TOKEN.\" && exit 1)",
    "          keys_file=\"${RUNNER_TEMP}/production-api-keys.json\"",
    "          trap 'rm -f -- \"$keys_file\"' EXIT",
    "          curl --fail --silent --show-error \\",
    "            --header \"Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}\" \\",
    "            \"https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/api-keys?reveal=true\" \\",
    "            --output \"$keys_file\"",
    "          chmod 600 \"$keys_file\"",
    "          node ./scripts/write-production-supabase-keys-env.mjs \\",
    "            --keys-file=\"$keys_file\" \\",
    "            --out=\"$GITHUB_ENV\"",
    "",
    "      - name: Download prebuilt Vercel output",
  ].join("\n"),
  "deploy_frontend key resolution steps",
);

deployJob = replaceExactlyOnce(
  deployJob,
  "          test -n \"$VITE_SUPABASE_PUBLISHABLE_KEY\" || (echo \"::error::Missing Supabase publishable key for the marketing BFF.\" && exit 1)",
  "          test -n \"$SUPABASE_PUBLISHABLE_KEY\" || (echo \"::error::Unable to resolve the Supabase publishable key for the marketing BFF.\" && exit 1)",
  "deploy_frontend publishable-key assertion",
);

deployJob = replaceExactlyOnce(
  deployJob,
  "          test -n \"$SUPABASE_SERVICE_ROLE_KEY\" || (echo \"::error::Missing server-only Supabase credential for the marketing BFF.\" && exit 1)",
  "          test -n \"$SUPABASE_SERVICE_ROLE_KEY\" || (echo \"::error::Unable to resolve the server-only Supabase credential for the marketing BFF.\" && exit 1)",
  "deploy_frontend elevated-key assertion",
);

deployJob = replaceExactlyOnce(
  deployJob,
  "              --env \"SUPABASE_URL=$VITE_SUPABASE_URL\" \\",
  "              --env \"SUPABASE_URL=$PRODUCTION_SUPABASE_URL\" \\",
  "Vercel Supabase URL injection",
);

deployJob = replaceExactlyOnce(
  deployJob,
  "              --env \"SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY\" \\",
  "              --env \"SUPABASE_PUBLISHABLE_KEY=$SUPABASE_PUBLISHABLE_KEY\" \\",
  "Vercel publishable-key injection",
);

workflow = workflow.slice(0, deployStart) + deployJob + workflow.slice(deployEnd);
writeFileSync(workflowPath, workflow, "utf8");
