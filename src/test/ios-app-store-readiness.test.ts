import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("iOS App Store readiness", () => {
  it("keeps privacy, permissions, deep links and push signing ready for iOS archives", () => {
    const infoPlist = read("ios/App/App/Info.plist");
    const entitlements = read("ios/App/App/App.entitlements");
    const privacyManifest = read("ios/App/App/PrivacyInfo.xcprivacy");
    const xcodeProject = read("ios/App/App.xcodeproj/project.pbxproj");
    const packageJson = read("package.json");

    expect(infoPlist).toContain("<key>ITSAppUsesNonExemptEncryption</key>");
    expect(infoPlist).toContain("<key>NSLocationWhenInUseUsageDescription</key>");
    expect(infoPlist).toContain("<key>NSCameraUsageDescription</key>");
    expect(infoPlist).toContain("<key>NSPhotoLibraryUsageDescription</key>");
    expect(infoPlist).toContain("<key>CFBundleURLSchemes</key>");
    expect(infoPlist).toContain("<string>tok</string>");

    expect(entitlements).toContain("<string>$(APS_ENVIRONMENT)</string>");
    expect(entitlements.match(/applinks:[^<]+/g)).toEqual([
      "applinks:thetok.ch",
      "applinks:www.thetok.ch",
      "applinks:app.thetok.ch",
      "applinks:admin.thetok.ch",
    ]);

    expect(privacyManifest).toContain("<key>NSPrivacyTracking</key>");
    expect(privacyManifest).toContain("NSPrivacyAccessedAPICategoryUserDefaults");
    expect(privacyManifest).toContain("<string>CA92.1</string>");
    expect(privacyManifest).toContain("NSPrivacyCollectedDataTypeEmailAddress");
    expect(privacyManifest).toContain("NSPrivacyCollectedDataTypePreciseLocation");
    expect(privacyManifest).toContain("NSPrivacyCollectedDataTypePurchaseHistory");
    expect(privacyManifest).toContain("NSPrivacyCollectedDataTypePerformanceData");

    expect(xcodeProject).toContain("CODE_SIGN_ENTITLEMENTS = App/App.entitlements;");
    expect(xcodeProject).toContain("APS_ENVIRONMENT = development;");
    expect(xcodeProject).toContain("APS_ENVIRONMENT = production;");
    expect(xcodeProject).toContain("PrivacyInfo.xcprivacy in Resources");

    expect(packageJson).toContain('"mobile:ios:readiness"');
    expect(packageJson).toContain('"mobile:appstore:check"');
  });
});
