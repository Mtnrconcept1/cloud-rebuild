import { readFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const pathOf = (path) => resolve(root, path);
const read = (path) => readFileSync(pathOf(path), "utf8");
const write = (path, value) => writeFileSync(pathOf(path), value, "utf8");

function replaceRequired(path, before, after, label = before.slice(0, 60)) {
  const source = read(path);
  if (!source.includes(before)) throw new Error(`${path}: required marker missing: ${label}`);
  write(path, source.replace(before, after));
}

function replaceAllRequired(path, before, after, min = 1) {
  const source = read(path);
  const count = source.split(before).length - 1;
  if (count < min) throw new Error(`${path}: expected at least ${min} occurrences of ${before}, found ${count}`);
  write(path, source.split(before).join(after));
}

function appendIfMissing(path, marker, block) {
  const source = read(path);
  if (source.includes(marker)) return;
  write(path, `${source.trimEnd()}\n\n${block.trim()}\n`);
}

// Fix Record<string,string> CORS spreading in the new functions.
for (const path of [
  "supabase/functions/tok-connect-chatgpt/index.ts",
  "supabase/functions/tok-pulse-widget/index.ts",
]) {
  let source = read(path);
  source = source.replaceAll("...Object.fromEntries(corsHeaders.entries())", "...corsHeaders");
  write(path, source);
}

// Never reference window during prerender/build.
replaceAllRequired(
  "src/pages/TokPulse.tsx",
  'new URL(url, window.location.origin)',
  'new URL(url, "https://www.thetok.ch")',
);

// Register new public Edge functions with handler-owned auth.
appendIfMissing(
  "supabase/config.toml",
  "[functions.tok-connect-chatgpt]",
  `
[functions.tok-connect-chatgpt]
verify_jwt = false

[functions.tok-pulse-widget]
verify_jwt = false
`,
);

// Route the one canonical MCP endpoint through the aggregation gateway.
replaceAllRequired(
  "vercel.json",
  "https://wwcrtyoueexyxkkikaos.supabase.co/functions/v1/tok-connect-mcp?tok_connect_route=protected-resource",
  "https://wwcrtyoueexyxkkikaos.supabase.co/functions/v1/tok-connect-chatgpt?tok_connect_route=protected-resource",
  1,
);
replaceAllRequired(
  "vercel.json",
  "https://wwcrtyoueexyxkkikaos.supabase.co/functions/v1/tok-connect-mcp\"",
  "https://wwcrtyoueexyxkkikaos.supabase.co/functions/v1/tok-connect-chatgpt\"",
  1,
);

// Resolve the only residual merge conflict in the historical MCP widget.
{
  const path = "supabase/functions/tok-connect-mcp/index.ts";
  let source = read(path);
  const conflict = /<<<<<<< Updated upstream\n([\s\S]*?)=======\n([\s\S]*?)>>>>>>> Stashed changes\n/;
  const match = source.match(conflict);
  if (match) {
    // Keep the upstream design-token implementation, which is the current TOK visual source.
    source = source.replace(conflict, `${match[1]}\n`);
  }
  if (/<<<<<<<|=======|>>>>>>>/.test(source)) throw new Error("tok-connect-mcp still contains merge markers");
  write(path, source);
}

// TOK Pulse is no longer a fake PWA demonstration: its web page is backed by the native widget feed.
{
  const path = "src/lib/featureCatalog.ts";
  let source = read(path);
  const block = /(name: "tok-pulse",[\s\S]{0,650}?description: )"[^"]*"([\s\S]{0,220}?defaultEnabled: )false/;
  if (!block.test(source)) throw new Error("tok-pulse feature block not found");
  source = source.replace(
    block,
    '$1"Widget iPhone natif TOK Pulse et raccourcis mobiles alimentés par les données publiques TOK."$2true',
  );
  write(path, source);
}

// Xcode project: embed a real WidgetKit extension in the app.
{
  const path = "ios/App/App.xcodeproj/project.pbxproj";
  let p = read(path);
  if (!p.includes("TokPulseWidget.appex")) {
    const IDS = {
      swiftBuild: "F10000000000000000000001",
      embedBuild: "F10000000000000000000002",
      product: "F10000000000000000000003",
      swiftFile: "F10000000000000000000004",
      infoFile: "F10000000000000000000005",
      frameworks: "F10000000000000000000006",
      group: "F10000000000000000000007",
      target: "F10000000000000000000008",
      resources: "F10000000000000000000009",
      sources: "F1000000000000000000000A",
      embedPhase: "F1000000000000000000000B",
      proxy: "F1000000000000000000000C",
      dependency: "F1000000000000000000000D",
      debug: "F1000000000000000000000E",
      release: "F1000000000000000000000F",
      configList: "F10000000000000000000010",
    };

    p = p.replace(
      "/* End PBXBuildFile section */",
      `\t\t${IDS.swiftBuild} /* TokPulseWidget.swift in Sources */ = {isa = PBXBuildFile; fileRef = ${IDS.swiftFile} /* TokPulseWidget.swift */; };\n\t\t${IDS.embedBuild} /* TokPulseWidget.appex in Embed Foundation Extensions */ = {isa = PBXBuildFile; fileRef = ${IDS.product} /* TokPulseWidget.appex */; settings = {ATTRIBUTES = (RemoveHeadersOnCopy, ); }; };\n/* End PBXBuildFile section */`,
    );

    p = p.replace(
      "/* Begin PBXFileReference section */",
      `/* Begin PBXContainerItemProxy section */\n\t\t${IDS.proxy} /* PBXContainerItemProxy */ = {isa = PBXContainerItemProxy; containerPortal = 504EC2FC1FED79650016851F /* Project object */; proxyType = 1; remoteGlobalIDString = ${IDS.target}; remoteInfo = TokPulseWidget; };\n/* End PBXContainerItemProxy section */\n\n/* Begin PBXCopyFilesBuildPhase section */\n\t\t${IDS.embedPhase} /* Embed Foundation Extensions */ = {isa = PBXCopyFilesBuildPhase; buildActionMask = 2147483647; dstPath = ""; dstSubfolderSpec = 13; files = (${IDS.embedBuild} /* TokPulseWidget.appex in Embed Foundation Extensions */, ); name = "Embed Foundation Extensions"; runOnlyForDeploymentPostprocessing = 0; };\n/* End PBXCopyFilesBuildPhase section */\n\n/* Begin PBXFileReference section */`,
    );

    p = p.replace(
      "/* End PBXFileReference section */",
      `\t\t${IDS.product} /* TokPulseWidget.appex */ = {isa = PBXFileReference; explicitFileType = "wrapper.app-extension"; includeInIndex = 0; path = TokPulseWidget.appex; sourceTree = BUILT_PRODUCTS_DIR; };\n\t\t${IDS.swiftFile} /* TokPulseWidget.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = TokPulseWidget.swift; sourceTree = "<group>"; };\n\t\t${IDS.infoFile} /* Info.plist */ = {isa = PBXFileReference; lastKnownFileType = text.plist.xml; path = Info.plist; sourceTree = "<group>"; };\n/* End PBXFileReference section */`,
    );

    p = p.replace(
      "/* End PBXFrameworksBuildPhase section */",
      `\t\t${IDS.frameworks} /* Frameworks */ = {isa = PBXFrameworksBuildPhase; buildActionMask = 2147483647; files = (); runOnlyForDeploymentPostprocessing = 0; };\n/* End PBXFrameworksBuildPhase section */`,
    );

    p = p.replace(
      "\t\t\t\t504EC3061FED79650016851F /* App */,\n\t\t\t\t504EC3051FED79650016851F /* Products */,",
      `\t\t\t\t504EC3061FED79650016851F /* App */,\n\t\t\t\t${IDS.group} /* TokPulseWidget */,\n\t\t\t\t504EC3051FED79650016851F /* Products */,`,
    );
    p = p.replace(
      "\t\t\t\t504EC3041FED79650016851F /* App.app */,\n",
      `\t\t\t\t504EC3041FED79650016851F /* App.app */,\n\t\t\t\t${IDS.product} /* TokPulseWidget.appex */,\n`,
    );
    p = p.replace(
      "/* End PBXGroup section */",
      `\t\t${IDS.group} /* TokPulseWidget */ = {isa = PBXGroup; children = (${IDS.swiftFile} /* TokPulseWidget.swift */, ${IDS.infoFile} /* Info.plist */, ); path = TokPulseWidget; sourceTree = "<group>"; };\n/* End PBXGroup section */`,
    );

    p = p.replace(
      "\t\t\tbuildPhases = (\n\t\t\t\t504EC3001FED79650016851F /* Sources */,\n\t\t\t\t504EC3011FED79650016851F /* Frameworks */,\n\t\t\t\t504EC3021FED79650016851F /* Resources */,\n\t\t\t);",
      `\t\t\tbuildPhases = (\n\t\t\t\t504EC3001FED79650016851F /* Sources */,\n\t\t\t\t504EC3011FED79650016851F /* Frameworks */,\n\t\t\t\t504EC3021FED79650016851F /* Resources */,\n\t\t\t\t${IDS.embedPhase} /* Embed Foundation Extensions */,\n\t\t\t);`,
    );
    p = p.replace(
      "\t\t\tdependencies = (\n\t\t\t);\n\t\t\tname = App;",
      `\t\t\tdependencies = (\n\t\t\t\t${IDS.dependency} /* PBXTargetDependency */,\n\t\t\t);\n\t\t\tname = App;`,
    );
    p = p.replace(
      "/* End PBXNativeTarget section */",
      `\t\t${IDS.target} /* TokPulseWidget */ = {isa = PBXNativeTarget; buildConfigurationList = ${IDS.configList} /* Build configuration list for PBXNativeTarget \"TokPulseWidget\" */; buildPhases = (${IDS.sources} /* Sources */, ${IDS.frameworks} /* Frameworks */, ${IDS.resources} /* Resources */, ); buildRules = (); dependencies = (); name = TokPulseWidget; productName = TokPulseWidget; productReference = ${IDS.product} /* TokPulseWidget.appex */; productType = "com.apple.product-type.app-extension"; };\n/* End PBXNativeTarget section */`,
    );

    p = p.replace(
      "\t\t\t\t\t504EC3031FED79650016851F = {\n\t\t\t\t\t\tCreatedOnToolsVersion = 9.2;\n\t\t\t\t\t\tLastSwiftMigration = 1100;\n\t\t\t\t\t\tProvisioningStyle = Automatic;\n\t\t\t\t\t};",
      `\t\t\t\t\t504EC3031FED79650016851F = {\n\t\t\t\t\t\tCreatedOnToolsVersion = 9.2;\n\t\t\t\t\t\tLastSwiftMigration = 1100;\n\t\t\t\t\t\tProvisioningStyle = Automatic;\n\t\t\t\t\t};\n\t\t\t\t\t${IDS.target} = { CreatedOnToolsVersion = 26.0; ProvisioningStyle = Automatic; };`,
    );
    p = p.replace(
      "\t\t\ttargets = (\n\t\t\t\t504EC3031FED79650016851F /* App */,\n\t\t\t);",
      `\t\t\ttargets = (\n\t\t\t\t504EC3031FED79650016851F /* App */,\n\t\t\t\t${IDS.target} /* TokPulseWidget */,\n\t\t\t);`,
    );

    p = p.replace(
      "/* End PBXResourcesBuildPhase section */",
      `\t\t${IDS.resources} /* Resources */ = {isa = PBXResourcesBuildPhase; buildActionMask = 2147483647; files = (); runOnlyForDeploymentPostprocessing = 0; };\n/* End PBXResourcesBuildPhase section */`,
    );
    p = p.replace(
      "/* End PBXSourcesBuildPhase section */",
      `\t\t${IDS.sources} /* Sources */ = {isa = PBXSourcesBuildPhase; buildActionMask = 2147483647; files = (${IDS.swiftBuild} /* TokPulseWidget.swift in Sources */, ); runOnlyForDeploymentPostprocessing = 0; };\n/* End PBXSourcesBuildPhase section */`,
    );
    p = p.replace(
      "/* Begin PBXVariantGroup section */",
      `/* Begin PBXTargetDependency section */\n\t\t${IDS.dependency} /* PBXTargetDependency */ = {isa = PBXTargetDependency; target = ${IDS.target} /* TokPulseWidget */; targetProxy = ${IDS.proxy} /* PBXContainerItemProxy */; };\n/* End PBXTargetDependency section */\n\n/* Begin PBXVariantGroup section */`,
    );

    const widgetDebug = `\t\t${IDS.debug} /* Debug */ = {\n\t\t\tisa = XCBuildConfiguration;\n\t\t\tbuildSettings = {\n\t\t\t\tAPPLICATION_EXTENSION_API_ONLY = YES;\n\t\t\t\tCODE_SIGN_STYLE = Automatic;\n\t\t\t\tCURRENT_PROJECT_VERSION = 1;\n\t\t\t\tINFOPLIST_FILE = TokPulseWidget/Info.plist;\n\t\t\t\tIPHONEOS_DEPLOYMENT_TARGET = 17.0;\n\t\t\t\tLD_RUNPATH_SEARCH_PATHS = (\"$(inherited)\", \"@executable_path/Frameworks\", \"@executable_path/../../Frameworks\", );\n\t\t\t\tMARKETING_VERSION = 1.0;\n\t\t\t\tPRODUCT_BUNDLE_IDENTIFIER = \"$(TOK_APP_BUNDLE_ID).TokPulseWidget\";\n\t\t\t\tPRODUCT_NAME = \"$(TARGET_NAME)\";\n\t\t\t\tSKIP_INSTALL = YES;\n\t\t\t\tSWIFT_ACTIVE_COMPILATION_CONDITIONS = DEBUG;\n\t\t\t\tSWIFT_VERSION = 5.0;\n\t\t\t\tTARGETED_DEVICE_FAMILY = \"1,2\";\n\t\t\t\tTOK_APP_BUNDLE_ID = ch.thetok.app;\n\t\t\t};\n\t\t\tname = Debug;\n\t\t};\n`;
    const widgetRelease = `\t\t${IDS.release} /* Release */ = {\n\t\t\tisa = XCBuildConfiguration;\n\t\t\tbuildSettings = {\n\t\t\t\tAPPLICATION_EXTENSION_API_ONLY = YES;\n\t\t\t\tCODE_SIGN_STYLE = Automatic;\n\t\t\t\tCURRENT_PROJECT_VERSION = 1;\n\t\t\t\tINFOPLIST_FILE = TokPulseWidget/Info.plist;\n\t\t\t\tIPHONEOS_DEPLOYMENT_TARGET = 17.0;\n\t\t\t\tLD_RUNPATH_SEARCH_PATHS = (\"$(inherited)\", \"@executable_path/Frameworks\", \"@executable_path/../../Frameworks\", );\n\t\t\t\tMARKETING_VERSION = 1.0;\n\t\t\t\tPRODUCT_BUNDLE_IDENTIFIER = \"$(TOK_APP_BUNDLE_ID).TokPulseWidget\";\n\t\t\t\tPRODUCT_NAME = \"$(TARGET_NAME)\";\n\t\t\t\tSKIP_INSTALL = YES;\n\t\t\t\tSWIFT_VERSION = 5.0;\n\t\t\t\tTARGETED_DEVICE_FAMILY = \"1,2\";\n\t\t\t\tTOK_APP_BUNDLE_ID = ch.thetok.app;\n\t\t\t};\n\t\t\tname = Release;\n\t\t};\n`;
    p = p.replace("/* End XCBuildConfiguration section */", `${widgetDebug}${widgetRelease}/* End XCBuildConfiguration section */`);
    p = p.replace(
      "/* End XCConfigurationList section */",
      `\t\t${IDS.configList} /* Build configuration list for PBXNativeTarget \"TokPulseWidget\" */ = {isa = XCConfigurationList; buildConfigurations = (${IDS.debug} /* Debug */, ${IDS.release} /* Release */, ); defaultConfigurationIsVisible = 0; defaultConfigurationName = Release; };\n/* End XCConfigurationList section */`,
    );

    // App and extension need different bundle ids. Use one overridable base setting instead of overriding PRODUCT_BUNDLE_IDENTIFIER globally.
    p = p.replaceAll("PRODUCT_BUNDLE_IDENTIFIER = com.tok.app;", 'PRODUCT_BUNDLE_IDENTIFIER = "$(TOK_APP_BUNDLE_ID)";\n\t\t\t\tTOK_APP_BUNDLE_ID = ch.thetok.app;');

    if (!p.includes("TokPulseWidget.appex in Embed Foundation Extensions") || !p.includes('productType = "com.apple.product-type.app-extension"')) {
      throw new Error("failed to materialize TokPulseWidget Xcode target");
    }
    write(path, p);
  }
}

// Avoid globally overriding PRODUCT_BUNDLE_IDENTIFIER: it would give the extension the same bundle id as the app.
for (const path of [".github/workflows/app-store-release.yml", ".github/workflows/ios-native-validation.yml"]) {
  let source = read(path);
  source = source.replaceAll('PRODUCT_BUNDLE_IDENTIFIER="$IOS_BUNDLE_ID"', 'TOK_APP_BUNDLE_ID="$IOS_BUNDLE_ID"');
  source = source.replaceAll("PRODUCT_BUNDLE_IDENTIFIER='ch.thetok.app'", "TOK_APP_BUNDLE_ID='ch.thetok.app'");
  write(path, source);
}

{
  const path = "src/test/ios-app-store-bundle-id.test.ts";
  let source = read(path);
  source = source.replace(
    "expect(releaseWorkflow).toContain('PRODUCT_BUNDLE_IDENTIFIER=\"$IOS_BUNDLE_ID\"');",
    "expect(releaseWorkflow).toContain('TOK_APP_BUNDLE_ID=\"$IOS_BUNDLE_ID\"');",
  );
  write(path, source);
}

// Extend operator documentation without exposing a second public MCP endpoint.
appendIfMissing(
  "docs/tok-connect/README.md",
  "## Gateway ChatGPT v3",
  `
## Gateway ChatGPT v3

L'URL publique reste **uniquement** \`https://www.thetok.ch/mcp\`. Vercel la route maintenant vers \`tok-connect-chatgpt\`, une gateway qui agrège côté serveur :

- le MCP transactionnel historique \`tok-connect-mcp\` ;
- le catalogue de parcours interne \`tok-connect-full-app-mcp\` ;
- les outils standard \`search\` / \`fetch\` ;
- les lectures restaurant, menu et TOK Credits ;
- la prévisualisation d'annulation ;
- la création et l'annulation réelles de réservations lorsque l'utilisateur final a explicitement confirmé et qu'une clé d'idempotence est fournie.

Les paiements, remboursements, publications, débits de crédits et mutations administrateur ne deviennent pas autonomes. ChatGPT peut les découvrir, les expliquer, les simuler et préparer un paquet de confirmation, puis TOK conserve l'exécution dans son flux protégé.

Le widget MCP est servi en \`text/html;profile=mcp-app\` et la gateway remplace la ressource historique qui contenait un marqueur de conflit CSS résiduel.
`,
);
appendIfMissing(
  "docs/tok-connect/full-app-mcp.md",
  "## Consolidation dans la gateway canonique",
  `
## Consolidation dans la gateway canonique

Depuis la gateway ChatGPT v3, les outils de ce serveur historique sont agrégés derrière \`https://www.thetok.ch/mcp\`. \`tok-connect-full-app-mcp\` reste une implémentation interne et **ne doit pas être enregistré comme second connecteur ChatGPT**.
`,
);

// Clean up this one-shot patch mechanism from the final branch.
for (const path of [
  "scripts/_apply-tok-connect-pulse-finalization.mjs",
  ".github/workflows/_tok-connect-pulse-agent-patch.yml",
]) {
  if (existsSync(pathOf(path))) unlinkSync(pathOf(path));
}

console.log("TOK Connect + Pulse finalization patch applied.");
