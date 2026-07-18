import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const DEFAULT_BUNDLE_ID = "com.tok.app";
const DEFAULT_OUTPUT = path.join("public", ".well-known", "apple-app-site-association");
const APPLE_TEAM_ID_PATTERN = /^[A-Z0-9]{10}$/;

export function buildAppleAppSiteAssociation(options = {}) {
  const teamId = String(options.teamId || "").trim().toUpperCase();
  const bundleId = String(options.bundleId || DEFAULT_BUNDLE_ID).trim();

  if (!APPLE_TEAM_ID_PATTERN.test(teamId)) {
    throw new Error("APPLE_TEAM_ID must contain exactly 10 uppercase letters or digits.");
  }
  if (bundleId !== DEFAULT_BUNDLE_ID) {
    throw new Error(`Refusing to generate an association for unexpected bundle ID: ${bundleId}`);
  }

  return {
    applinks: {
      apps: [],
      details: [
        {
          appIDs: [`${teamId}.${bundleId}`],
          components: [
            {
              "/": "/*",
              comment: "TOK Universal Links",
            },
          ],
        },
      ],
    },
  };
}

export function writeAppleAppSiteAssociation(options = {}) {
  const root = options.root || process.cwd();
  const relativeOutput = options.output || DEFAULT_OUTPUT;
  if (path.isAbsolute(relativeOutput)) {
    throw new Error("The Apple association output must be repository-relative.");
  }
  const outputPath = path.resolve(root, relativeOutput);
  const repositoryRelativeOutput = path.relative(path.resolve(root), outputPath);
  if (repositoryRelativeOutput === ".." || repositoryRelativeOutput.startsWith(`..${path.sep}`)) {
    throw new Error("The Apple association output must stay inside the repository.");
  }
  const outputDirectory = path.dirname(outputPath);
  const payload = buildAppleAppSiteAssociation(options);
  const temporaryPath = `${outputPath}.${process.pid}.tmp`;

  fs.mkdirSync(outputDirectory, { recursive: true });
  try {
    fs.writeFileSync(temporaryPath, `${JSON.stringify(payload, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o644,
    });
    fs.renameSync(temporaryPath, outputPath);
  } finally {
    fs.rmSync(temporaryPath, { force: true });
  }

  return { outputPath, payload };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  const outputFlag = process.argv.indexOf("--out");
  const output = outputFlag >= 0 ? process.argv[outputFlag + 1] : DEFAULT_OUTPUT;
  if (outputFlag >= 0 && !output) {
    throw new Error("--out requires a repository-relative path.");
  }

  const result = writeAppleAppSiteAssociation({
    teamId: process.env.APPLE_TEAM_ID,
    output,
  });
  console.log(`Apple App Site Association written to ${path.relative(process.cwd(), result.outputPath)}.`);
}
