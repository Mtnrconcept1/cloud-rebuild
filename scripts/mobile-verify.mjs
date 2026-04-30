import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
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
  run("npx", ["cap", "sync", ...platforms]);
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
  case "verify":
    buildAndroid("Debug");
    if (process.platform === "darwin") buildIosRelease();
    break;
  default:
    console.error(`Unknown mobile verification command: ${command}`);
    process.exit(1);
}
