import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";

const command = process.argv[2] || "verify";
const workspaceRoot = process.cwd();
const workspaceTmp = path.join(tmpdir(), "tok-mobile-verify", path.basename(workspaceRoot));

function detectAndroidSdk() {
  const candidates = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    path.join(homedir(), "AppData", "Local", "Android", "Sdk"),
    path.join(homedir(), "Library", "Android", "sdk"),
    path.join(homedir(), "Android", "Sdk"),
  ].filter(Boolean);

  return candidates.find((candidate) => existsSync(candidate));
}

function mobileEnv() {
  mkdirSync(workspaceTmp, { recursive: true });

  const env = { ...process.env };
  env.GRADLE_USER_HOME ||= path.join(workspaceTmp, "gradle-home");
  env.ANDROID_USER_HOME ||= path.join(workspaceTmp, "android-home");
  mkdirSync(env.GRADLE_USER_HOME, { recursive: true });
  mkdirSync(env.ANDROID_USER_HOME, { recursive: true });

  const androidSdk = detectAndroidSdk();
  if (androidSdk) {
    env.ANDROID_HOME ||= androidSdk;
    env.ANDROID_SDK_ROOT ||= androidSdk;
  }

  delete env.ANDROID_PREFS_ROOT;
  return env;
}

function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, {
    cwd: options.cwd || process.cwd(),
    env: options.env || process.env,
    shell: process.platform === "win32",
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function gradleWrapper() {
  return process.platform === "win32" ? "gradlew.bat" : "./gradlew";
}

function buildWeb() {
  run("node", [path.join("node_modules", "vite", "bin", "vite.js"), "build"]);
}

function syncCapacitor(platforms = ["android", "ios"]) {
  run("pnpm", ["exec", "cap", "sync", ...platforms]);
}

function buildAndroidTask(taskName) {
  const env = mobileEnv();
  buildWeb();
  syncCapacitor(["android"]);
  run(gradleWrapper(), [`:app:${taskName}`, "--no-daemon"], { cwd: "android", env });
}

function buildAndroid(variant) {
  buildAndroidTask(`assemble${variant}`);
}

function buildAndroidBundle() {
  buildAndroidTask("bundleRelease");
  const bundlePath = path.join(workspaceRoot, "android", "app", "build", "outputs", "bundle", "release", "app-release.aab");
  if (!existsSync(bundlePath)) {
    console.error(`Android bundle build did not produce ${bundlePath}`);
    process.exit(1);
  }

  const bundleSize = statSync(bundlePath).size;
  const signingStatus = existsSync(path.join(workspaceRoot, "android", "keystore.properties"))
    ? "signed with the configured external keystore"
    : "unsigned because android/keystore.properties is not present";

  console.log(`Android release bundle ready: ${bundlePath} (${bundleSize} bytes, ${signingStatus}).`);
}

function buildIosRelease() {
  if (process.platform !== "darwin") {
    console.error("iOS release builds require macOS with Xcode installed.");
    process.exit(1);
  }

  buildWeb();
  syncCapacitor(["ios"]);
  run("xcodebuild", [
    "-project",
    "ios/App/App.xcodeproj",
    "-scheme",
    "App",
    "-configuration",
    "Release",
    "-destination",
    "generic/platform=iOS",
    "build",
  ]);
}

function readProjectFile(relativePath) {
  const absolutePath = path.join(workspaceRoot, relativePath);
  if (!existsSync(absolutePath)) {
    console.error(`Missing required mobile file: ${relativePath}`);
    process.exit(1);
  }

  return readFileSync(absolutePath, "utf8");
}

function assertIncludes(source, expected, label) {
  if (!source.includes(expected)) {
    console.error(`Mobile readiness check failed: ${label}`);
    console.error(`Expected to find: ${expected}`);
    process.exit(1);
  }
}

function assertExcludes(source, unexpected, label) {
  if (source.includes(unexpected)) {
    console.error(`Mobile readiness check failed: ${label}`);
    console.error(`Did not expect to find: ${unexpected}`);
    process.exit(1);
  }
}

function assertMatches(source, pattern, label) {
  if (!pattern.test(source)) {
    console.error(`Mobile readiness check failed: ${label}`);
    console.error(`Expected to match: ${pattern}`);
    process.exit(1);
  }
}

function readGradleVersion(source, name) {
  const match = source.match(new RegExp(`${name}\\s*=\\s*(\\d+)`));
  return match ? Number.parseInt(match[1], 10) : Number.NaN;
}

function assertMinGradleVersion(source, name, minimum) {
  const value = readGradleVersion(source, name);
  if (!Number.isFinite(value) || value < minimum) {
    console.error(`Mobile readiness check failed: ${name} must be at least ${minimum}`);
    console.error(`Current value: ${Number.isFinite(value) ? value : "missing"}`);
    process.exit(1);
  }
}

function checkIosAppStoreReadiness() {
  const infoPlist = readProjectFile("ios/App/App/Info.plist");
  const entitlements = readProjectFile("ios/App/App/App.entitlements");
  const privacyManifest = readProjectFile("ios/App/App/PrivacyInfo.xcprivacy");
  const xcodeProject = readProjectFile("ios/App/App.xcodeproj/project.pbxproj");

  assertIncludes(infoPlist, "<key>CFBundleURLSchemes</key>", "custom URL scheme is declared");
  assertIncludes(infoPlist, "<string>tok</string>", "tok URL scheme is declared");
  assertIncludes(infoPlist, "<key>ITSAppUsesNonExemptEncryption</key>", "export compliance key is declared");
  assertIncludes(infoPlist, "<key>NSLocationWhenInUseUsageDescription</key>", "location permission copy is declared");
  assertIncludes(infoPlist, "<key>NSCameraUsageDescription</key>", "camera permission copy is declared");
  assertIncludes(infoPlist, "<key>NSPhotoLibraryUsageDescription</key>", "photo library permission copy is declared");

  assertIncludes(entitlements, "<string>$(APS_ENVIRONMENT)</string>", "APNs environment uses per-configuration build setting");
  assertIncludes(entitlements, "applinks:thetok.ch", "root Universal Link domain is declared");
  assertIncludes(entitlements, "applinks:www.thetok.ch", "public Universal Link domain is declared");
  assertIncludes(entitlements, "applinks:app.thetok.ch", "app Universal Link domain is declared");
  assertIncludes(entitlements, "applinks:admin.thetok.ch", "admin Universal Link domain is declared");

  assertIncludes(privacyManifest, "<key>NSPrivacyTracking</key>", "privacy tracking declaration exists");
  assertIncludes(privacyManifest, "<false/>", "tracking is declared off");
  assertIncludes(privacyManifest, "NSPrivacyAccessedAPICategoryUserDefaults", "UserDefaults required-reason API is declared");
  assertIncludes(privacyManifest, "<string>CA92.1</string>", "UserDefaults app-specific reason is declared");
  assertIncludes(privacyManifest, "NSPrivacyCollectedDataTypeEmailAddress", "privacy manifest documents account data");
  assertIncludes(privacyManifest, "NSPrivacyCollectedDataTypePreciseLocation", "privacy manifest documents location data");
  assertIncludes(privacyManifest, "NSPrivacyCollectedDataTypePurchaseHistory", "privacy manifest documents order data");

  assertIncludes(xcodeProject, "CODE_SIGN_ENTITLEMENTS = App/App.entitlements;", "Xcode target signs entitlements");
  assertIncludes(xcodeProject, "APS_ENVIRONMENT = development;", "Debug APNs environment is development");
  assertIncludes(xcodeProject, "APS_ENVIRONMENT = production;", "Release APNs environment is production");
  assertIncludes(xcodeProject, "PrivacyInfo.xcprivacy in Resources", "privacy manifest is copied into the iOS app bundle");

  console.log("iOS App Store readiness checks passed.");
}

function checkAndroidGooglePlayReadiness() {
  const packageJson = readProjectFile("package.json");
  const variablesGradle = readProjectFile("android/variables.gradle");
  const settingsGradle = readProjectFile("android/settings.gradle");
  const appGradle = readProjectFile("android/app/build.gradle");
  const manifest = readProjectFile("android/app/src/main/AndroidManifest.xml");
  const dataExtractionRules = readProjectFile("android/app/src/main/res/xml/data_extraction_rules.xml");
  const mainActivity = readProjectFile("android/app/src/main/java/com/tok/app/MainActivity.java");
  const googleServices = readProjectFile("android/app/google-services.json");
  const mobileBuildScript = readProjectFile("scripts/mobile-android-build.ps1");
  const releaseReadinessDoc = readProjectFile("docs/audits/mobile-release-readiness-2026-04-30.md");

  assertMinGradleVersion(variablesGradle, "compileSdkVersion", 35);
  assertMinGradleVersion(variablesGradle, "targetSdkVersion", 35);
  assertMinGradleVersion(variablesGradle, "minSdkVersion", 23);
  assertExcludes(settingsGradle, "foojay-resolver-convention", "Android settings avoid optional Foojay plugin resolution");

  assertIncludes(appGradle, 'namespace = "com.tok.app"', "Android namespace matches the Play package");
  assertIncludes(appGradle, 'applicationId "com.tok.app"', "Android applicationId matches the Play package");
  assertIncludes(appGradle, 'versionCode readReleaseValue("TOK_VERSION_CODE", "1").toInteger()', "versionCode is release-configurable");
  assertIncludes(appGradle, 'versionName readReleaseValue("TOK_VERSION_NAME", "1.0")', "versionName is release-configurable");
  assertIncludes(appGradle, "keystore.properties", "release signing stays outside tracked source");
  assertIncludes(appGradle, "hasReleaseKeystore", "release signing is conditional on external keystore configuration");
  assertIncludes(appGradle, "if (hasReleaseKeystore) {\n                signingConfig signingConfigs.release", "release builds avoid empty signing configs when no keystore is present");
  assertIncludes(appGradle, "minifyEnabled true", "release minification is enabled");
  assertIncludes(appGradle, "shrinkResources true", "release resource shrinking is enabled");

  assertIncludes(manifest, 'android:allowBackup="false"', "Android cloud backup is disabled");
  assertIncludes(manifest, 'android:fullBackupContent="false"', "legacy full backup is disabled");
  assertIncludes(manifest, 'android:dataExtractionRules="@xml/data_extraction_rules"', "Android 12+ data extraction rules are declared");
  assertIncludes(manifest, 'android:usesCleartextTraffic="false"', "cleartext HTTP traffic is disabled");
  assertIncludes(manifest, '<uses-permission android:name="android.permission.INTERNET" />', "internet permission is declared");
  assertIncludes(manifest, '<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />', "precise location permission is declared");
  assertIncludes(manifest, '<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />', "coarse location permission is declared");
  assertIncludes(manifest, '<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />', "Android 13+ notification permission is declared");
  assertIncludes(manifest, '<uses-permission android:name="android.permission.VIBRATE" />', "notification vibration permission is declared");
  assertIncludes(manifest, 'android:autoVerify="true"', "Android App Links are configured for verification");
  assertIncludes(manifest, 'android:host="thetok.ch"', "root production domain App Link is declared");
  assertIncludes(manifest, 'android:host="www.thetok.ch"', "public production domain App Link is declared");
  assertIncludes(manifest, 'android:host="app.thetok.ch"', "app production domain App Link is declared");
  assertIncludes(manifest, 'android:host="admin.thetok.ch"', "admin production domain App Link is declared");
  assertIncludes(manifest, '<data android:scheme="tok" />', "custom tok scheme is declared");
  assertMatches(manifest, /android:name="\.MainActivity"[\s\S]*android:exported="true"/, "launch activity is explicitly exported");
  assertIncludes(manifest, 'android:name="com.google.firebase.messaging.default_notification_channel_id"', "Firebase default notification channel is declared");
  assertIncludes(manifest, 'android:value="tok_orders"', "Firebase default notification channel matches native channel");

  assertIncludes(dataExtractionRules, '<exclude domain="root" path="." />', "cloud backup data extraction excludes app data");
  assertIncludes(dataExtractionRules, "<device-transfer>", "device transfer rules are declared");

  assertIncludes(mainActivity, 'ORDERS_CHANNEL_ID = "tok_orders"', "native notification channel id matches manifest");
  assertIncludes(mainActivity, "NotificationManager.IMPORTANCE_HIGH", "critical order channel has high importance");

  assertIncludes(googleServices, '"package_name": "com.tok.app"', "Firebase Android package matches applicationId");
  assertIncludes(googleServices, '"mobilesdk_app_id"', "Firebase Android app id is present");

  assertIncludes(mobileBuildScript, "pnpm run build", "Android PowerShell build uses pnpm");
  assertIncludes(mobileBuildScript, "pnpm exec cap sync android", "Android PowerShell sync uses pnpm");
  assertIncludes(mobileBuildScript, "[System.IO.Path]::GetTempPath()", "Android PowerShell build keeps native caches outside the repo");
  assertExcludes(mobileBuildScript, 'Join-Path (Get-Location) ".tmp"', "Android PowerShell build does not create repo-local native caches");
  assertIncludes(packageJson, '"mobile:android:readiness"', "Android readiness script is registered");
  assertIncludes(packageJson, '"mobile:playstore:check"', "Google Play source check script is registered");
  assertIncludes(packageJson, '"mobile:build:android:bundle"', "Android App Bundle build script is registered");
  assertIncludes(readProjectFile("scripts/mobile-verify.mjs"), "app-release.aab", "Android bundle build verifies the produced AAB artifact");

  assertIncludes(releaseReadinessDoc, "Google Play Data Safety", "Google Play Data Safety guidance is documented");
  assertIncludes(releaseReadinessDoc, "/.well-known/assetlinks.json", "Android App Links assetlinks guidance is documented");
  assertIncludes(releaseReadinessDoc, "TOK_VERSION_CODE", "Play release versioning guidance is documented");

  console.log("Android Google Play readiness checks passed.");
}

switch (command) {
  case "sync":
    buildWeb();
    syncCapacitor();
    break;
  case "android-debug":
    buildAndroid("Debug");
    break;
  case "android-release":
    buildAndroid("Release");
    break;
  case "android-bundle":
    buildAndroidBundle();
    break;
  case "ios-release":
    buildIosRelease();
    break;
  case "ios-readiness":
    checkIosAppStoreReadiness();
    break;
  case "android-readiness":
    checkAndroidGooglePlayReadiness();
    break;
  case "verify":
    buildAndroid("Debug");
    if (process.platform === "darwin") buildIosRelease();
    break;
  default:
    console.error(`Unknown mobile verification command: ${command}`);
    process.exit(1);
}
