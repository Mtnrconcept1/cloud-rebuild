import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const command = process.argv[2] || "verify";
const workspaceRoot = process.cwd();
const workspaceTmp = path.join(workspaceRoot, ".tmp");

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

function buildAndroid(variant) {
  const env = mobileEnv();
  buildWeb();
  syncCapacitor(["android"]);
  run(gradleWrapper(), [`:app:assemble${variant}`, "--no-daemon"], { cwd: "android", env });
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
    console.error(`Missing required iOS file: ${relativePath}`);
    process.exit(1);
  }

  return readFileSync(absolutePath, "utf8");
}

function assertIncludes(source, expected, label) {
  if (!source.includes(expected)) {
    console.error(`iOS readiness check failed: ${label}`);
    console.error(`Expected to find: ${expected}`);
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
  assertIncludes(entitlements, "applinks:www.thetok.ch", "public Universal Link domain is declared");
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
  case "ios-release":
    buildIosRelease();
    break;
  case "ios-readiness":
    checkIosAppStoreReadiness();
    break;
  case "verify":
    buildAndroid("Debug");
    if (process.platform === "darwin") buildIosRelease();
    break;
  default:
    console.error(`Unknown mobile verification command: ${command}`);
    process.exit(1);
}
