import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const IOS_BUNDLE_ID = "ch.thetok.app";
const ANDROID_PACKAGE_ID = "com.tok.app";
const APPLE_APPLICATION_ID = `73HG6QD4AJ.${IOS_BUNDLE_ID}`;

describe("iOS App Store bundle identity", () => {
  const preflightWorkflow = read(".github/workflows/app-store-connect-preflight.yml");
  const releaseWorkflow = read(".github/workflows/app-store-release.yml");
  const preflightScript = read("scripts/app-store-connect-preflight.mjs");
  const infoPlist = read("ios/App/App/Info.plist");
  const aasa = read("public/.well-known/apple-app-site-association");
  const androidGradle = read("android/app/build.gradle");
  const googleServices = read("android/app/google-services.json");

  it("targets the App Store record created for Thetok", () => {
    expect(preflightWorkflow).toContain(`IOS_BUNDLE_ID: ${IOS_BUNDLE_ID}`);
    expect(releaseWorkflow).toContain(`IOS_BUNDLE_ID: ${IOS_BUNDLE_ID}`);
    expect(preflightScript).toContain(`const DEFAULT_BUNDLE_ID = "${IOS_BUNDLE_ID}";`);
    expect(infoPlist).toContain(`<string>${IOS_BUNDLE_ID}</string>`);
  });

  it("forces and verifies the bundle identifier on the archived iOS app", () => {
    expect(releaseWorkflow).toContain('PRODUCT_BUNDLE_IDENTIFIER="$IOS_BUNDLE_ID"');
    expect(releaseWorkflow).toContain("Print :ApplicationProperties:CFBundleIdentifier");
    expect(releaseWorkflow).toContain('if [[ "$actual_bundle_id" != "$IOS_BUNDLE_ID" ]]');
  });

  it("publishes the Associated Domains application identifier for this Apple team", () => {
    const association = JSON.parse(aasa) as {
      applinks?: { details?: Array<{ appIDs?: string[] }> };
    };
    const appIds = association.applinks?.details?.flatMap((detail) => detail.appIDs ?? []) ?? [];

    expect(appIds).toContain(APPLE_APPLICATION_ID);
  });

  it("does not rename the existing Android application while fixing iOS", () => {
    expect(androidGradle).toContain(`namespace = "${ANDROID_PACKAGE_ID}"`);
    expect(androidGradle).toContain(`applicationId "${ANDROID_PACKAGE_ID}"`);
    expect(googleServices).toContain(`"package_name": "${ANDROID_PACKAGE_ID}"`);
    expect(releaseWorkflow).not.toContain(`IOS_BUNDLE_ID: ${ANDROID_PACKAGE_ID}`);
    expect(preflightWorkflow).not.toContain(`IOS_BUNDLE_ID: ${ANDROID_PACKAGE_ID}`);
  });
});
