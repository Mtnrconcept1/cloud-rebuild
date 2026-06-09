import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(relativePath: string) {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

function readGradleVersion(source: string, name: string) {
  const match = source.match(new RegExp(`${name}\\s*=\\s*(\\d+)`));
  return match ? Number.parseInt(match[1], 10) : Number.NaN;
}

describe("Android Google Play readiness", () => {
  it("keeps the Android source package aligned with Play release requirements", () => {
    const packageJson = read("package.json");
    const variablesGradle = read("android/variables.gradle");
    const settingsGradle = read("android/settings.gradle");
    const appGradle = read("android/app/build.gradle");
    const manifest = read("android/app/src/main/AndroidManifest.xml");
    const dataExtractionRules = read("android/app/src/main/res/xml/data_extraction_rules.xml");
    const mainActivity = read("android/app/src/main/java/com/tok/app/MainActivity.java");
    const googleServices = read("android/app/google-services.json");
    const mobileBuildScript = read("scripts/mobile-android-build.ps1");
    const mobileVerifyScript = read("scripts/mobile-verify.mjs");
    const readinessDoc = read("docs/audits/mobile-release-readiness-2026-04-30.md");

    expect(readGradleVersion(variablesGradle, "compileSdkVersion")).toBeGreaterThanOrEqual(35);
    expect(readGradleVersion(variablesGradle, "targetSdkVersion")).toBeGreaterThanOrEqual(35);
    expect(readGradleVersion(variablesGradle, "minSdkVersion")).toBeGreaterThanOrEqual(23);
    expect(settingsGradle).not.toContain("foojay-resolver-convention");

    expect(appGradle).toContain('namespace = "com.tok.app"');
    expect(appGradle).toContain('applicationId "com.tok.app"');
    expect(appGradle).toContain('versionCode readReleaseValue("TOK_VERSION_CODE", "1").toInteger()');
    expect(appGradle).toContain('versionName readReleaseValue("TOK_VERSION_NAME", "1.0")');
    expect(appGradle).toContain("keystore.properties");
    expect(appGradle).toContain("hasReleaseKeystore");
    expect(appGradle).toContain("if (hasReleaseKeystore) {\n                signingConfig signingConfigs.release");
    expect(appGradle).toContain("minifyEnabled true");
    expect(appGradle).toContain("shrinkResources true");

    expect(manifest).toContain('android:allowBackup="false"');
    expect(manifest).toContain('android:fullBackupContent="false"');
    expect(manifest).toContain('android:dataExtractionRules="@xml/data_extraction_rules"');
    expect(manifest).toContain('android:usesCleartextTraffic="false"');
    expect(manifest).toContain('<uses-permission android:name="android.permission.INTERNET" />');
    expect(manifest).toContain('<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />');
    expect(manifest).toContain('<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />');
    expect(manifest).toContain('<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />');
    expect(manifest).toContain('<uses-permission android:name="android.permission.VIBRATE" />');
    expect(manifest).toContain('android:autoVerify="true"');
    expect(manifest).toContain('android:host="thetok.ch"');
    expect(manifest).toContain('android:host="www.thetok.ch"');
    expect(manifest).toContain('android:host="app.thetok.ch"');
    expect(manifest).toContain('android:host="admin.thetok.ch"');
    expect(manifest).toContain('<data android:scheme="tok" />');
    expect(manifest).toMatch(/android:name="\.MainActivity"[\s\S]*android:exported="true"/);
    expect(manifest).toContain('android:value="tok_orders"');

    expect(dataExtractionRules).toContain('<exclude domain="root" path="." />');
    expect(dataExtractionRules).toContain("<device-transfer>");

    expect(mainActivity).toContain('ORDERS_CHANNEL_ID = "tok_orders"');
    expect(mainActivity).toContain("NotificationManager.IMPORTANCE_HIGH");
    expect(googleServices).toContain('"package_name": "com.tok.app"');

    expect(mobileBuildScript).toContain("pnpm run build");
    expect(mobileBuildScript).toContain("pnpm exec cap sync android");
    expect(mobileBuildScript).toContain("[System.IO.Path]::GetTempPath()");
    expect(mobileBuildScript).not.toContain('Join-Path (Get-Location) ".tmp"');
    expect(mobileBuildScript).not.toMatch(/(^|\n)\s*npm\b/);
    expect(mobileBuildScript).not.toMatch(/(^|\n)\s*npx\b/);

    expect(packageJson).toContain('"mobile:android:readiness"');
    expect(packageJson).toContain('"mobile:playstore:check"');
    expect(packageJson).toContain('"mobile:build:android:bundle"');
    expect(mobileVerifyScript).toContain("app-release.aab");
    expect(mobileVerifyScript).toContain("Android release bundle ready");
    expect(readinessDoc).toContain("Google Play Data Safety");
    expect(readinessDoc).toContain("/.well-known/assetlinks.json");
    expect(readinessDoc).toContain("android/keystore.properties");
    expect(readinessDoc).toContain("TOK_VERSION_CODE");
  });
});
