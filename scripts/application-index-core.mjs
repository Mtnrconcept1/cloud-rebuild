import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

export const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const INDEX_JSON_PATH = "docs/architecture/tok-application-search-index.json";
export const REFERENCE_MARKDOWN_PATH = "docs/architecture/TOK_APPLICATION_REFERENCE.md";
export const RUNTIME_EVIDENCE_PATH = "docs/architecture/tok-runtime-evidence-2026-10-03.json";
export const GENERATED_PATHS = new Set([INDEX_JSON_PATH, REFERENCE_MARKDOWN_PATH]);
const INDEX_IMPLEMENTATION_PATHS = [
  "scripts/application-index-core.mjs",
  "scripts/generate-application-index.mjs",
  "scripts/search-application-index.mjs",
  "src/test/application-search-index.test.ts",
];

const CODE_EXTENSIONS = new Set([".cjs", ".cts", ".js", ".jsx", ".mjs", ".mts", ".ts", ".tsx"]);
const ROUTE_GUARDS = new Set([
  "AdminProtectedRoute",
  "ClientSurfaceRoute",
  "DashboardRoute",
  "MarketingProtectedRoute",
  "ProtectedRoute",
]);
const INTEGRATIONS = [
  "cloudflare",
  "firebase",
  "google",
  "openai",
  "photon",
  "resend",
  "sentry",
  "stripe",
  "supabase",
  "twint",
  "vercel",
];

const normalizePath = (value) => value.replaceAll("\\", "/");
const compact = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const compareText = (a, b) => (a === b ? 0 : a < b ? -1 : 1);
const uniqueSorted = (values) => [...new Set(values.filter(Boolean))].sort(compareText);
const shortHash = (value) => createHash("sha1").update(value).digest("hex").slice(0, 12);
const makeId = (type, ...parts) => `${type}:${shortHash(JSON.stringify(parts))}`;
const humanize = (value) => value
  .replace(/\.[^.]+$/, "")
  .replace(/[-_]+/g, " ")
  .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
  .replace(/\b\w/g, (letter) => letter.toUpperCase());

function readUtf8(root, relativePath, digestSources) {
  const normalized = normalizePath(relativePath);
  const absolutePath = path.join(root, normalized);
  if (!existsSync(absolutePath)) return "";
  const content = readFileSync(absolutePath, "utf8").replaceAll("\r\n", "\n");
  if (digestSources && !GENERATED_PATHS.has(normalized)) digestSources.set(normalized, content);
  return content;
}

export function listRepositoryFiles(root = REPOSITORY_ROOT) {
  const output = execFileSync(
    "git",
    ["ls-files", "--cached", "-z"],
    { cwd: root, encoding: "utf8" },
  );
  const files = output.split("\0").map(normalizePath).filter(Boolean);
  for (const generatedPath of [...GENERATED_PATHS, ...INDEX_IMPLEMENTATION_PATHS]) {
    if (existsSync(path.join(root, generatedPath))) files.push(generatedPath);
  }
  return uniqueSorted(files);
}

function digestSourceMap(sourceMap, repositoryFiles) {
  const hash = createHash("sha256");
  for (const file of repositoryFiles) hash.update(`file:${file}\n`);
  for (const [file, content] of [...sourceMap.entries()].sort(([a], [b]) => compareText(a, b))) {
    hash.update(`source:${file}\n${content}\n`);
  }
  return hash.digest("hex");
}

const lineAt = (sourceFile, node) => sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
const jsxTagName = (node) => node.tagName?.getText?.() ?? "";

function jsxAttribute(node, name, sourceFile) {
  const attribute = node.attributes?.properties?.find(
    (property) => ts.isJsxAttribute(property) && property.name.getText(sourceFile) === name,
  );
  if (!attribute || !ts.isJsxAttribute(attribute) || !attribute.initializer) return null;
  if (ts.isStringLiteral(attribute.initializer)) return attribute.initializer.text;
  if (ts.isJsxExpression(attribute.initializer) && attribute.initializer.expression) {
    return compact(attribute.initializer.expression.getText(sourceFile));
  }
  return compact(attribute.initializer.getText(sourceFile));
}

function collectJsxTags(node) {
  const tags = [];
  const visit = (child) => {
    if (ts.isJsxSelfClosingElement(child) || ts.isJsxOpeningElement(child)) tags.push(jsxTagName(child));
    ts.forEachChild(child, visit);
  };
  visit(node);
  return uniqueSorted(tags);
}

function resolveModuleFile(root, modulePath) {
  const candidates = [
    modulePath,
    ...[".tsx", ".ts", ".jsx", ".js", ".mjs"].map((extension) => `${modulePath}${extension}`),
    ...[".tsx", ".ts", ".jsx", ".js", ".mjs"].map((extension) => path.posix.join(modulePath, `index${extension}`)),
  ];
  return normalizePath(candidates.find((candidate) => existsSync(path.join(root, candidate))) ?? modulePath);
}

function componentSourceMap(root, relativePath, sourceFile) {
  const result = new Map();
  const sourceDirectory = path.posix.dirname(normalizePath(relativePath));
  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      const specifier = statement.moduleSpecifier.text;
      if (!specifier.startsWith(".")) continue;
      const resolved = resolveModuleFile(root, path.posix.normalize(path.posix.join(sourceDirectory, specifier)));
      const clause = statement.importClause;
      if (clause?.name) result.set(clause.name.text, resolved);
      if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        for (const element of clause.namedBindings.elements) result.set(element.name.text, resolved);
      }
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue;
        let importedPath = null;
        const visit = (node) => {
          if (
            !importedPath
            && ts.isCallExpression(node)
            && node.expression.kind === ts.SyntaxKind.ImportKeyword
            && node.arguments[0]
            && ts.isStringLiteral(node.arguments[0])
          ) importedPath = node.arguments[0].text;
          ts.forEachChild(node, visit);
        };
        visit(declaration.initializer);
        if (importedPath?.startsWith(".")) {
          result.set(
            declaration.name.text,
            resolveModuleFile(root, path.posix.normalize(path.posix.join(sourceDirectory, importedPath))),
          );
        }
      }
    }
  }
  return result;
}

function classifySurface(routePath) {
  if (routePath === "*") return "system";
  if (routePath.startsWith("/admin")) return "admin";
  if (routePath.startsWith("/marketing")) return "marketing";
  if (routePath.startsWith("/dashboard")) return "restaurant";
  if (routePath.startsWith("/courier")) return "courier";
  if (routePath.startsWith("/commercial")) return "commercial";
  if (/^\/(mon-espace|compte|espace-client|reservations|mes-avis|profil|parametres|memoire-tok|notifications|commandes|commande|points-cadeau)/.test(routePath)) {
    return "client-account";
  }
  return "public";
}

function parseFrontendRoutes(root, digestSources) {
  const relativePath = "src/App.tsx";
  const source = readUtf8(root, relativePath, digestSources);
  const sourceFile = ts.createSourceFile(relativePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const imports = componentSourceMap(root, relativePath, sourceFile);
  const routes = [];
  const visit = (node) => {
    if (ts.isJsxSelfClosingElement(node) && jsxTagName(node) === "Route") {
      const routePath = jsxAttribute(node, "path", sourceFile) ?? "(path dynamique)";
      const element = jsxAttribute(node, "element", sourceFile) ?? "";
      const tags = collectJsxTags(node);
      const featureMatch = element.match(/<FeatureSwitch\s+[^>]*enabled=\{([^}]+)\}/);
      const redirectMatch = element.match(/<Navigate\s+[^>]*to=(?:"([^"]+)"|\{([^}]+)\})/);
      const requiredRoleMatch = element.match(/requiredRole="([^"]+)"/);
      const requiredRolesMatch = element.match(/requiredRoles=\{\[([^\]]+)\]\}/);
      const components = tags.filter((tag) => tag !== "Route");
      routes.push({
        path: routePath,
        line: lineAt(sourceFile, node),
        surface: classifySurface(routePath),
        element,
        components,
        pageSources: uniqueSorted(components.map((component) => imports.get(component)).filter(Boolean)),
        guards: tags.filter((tag) => ROUTE_GUARDS.has(tag)),
        requiredRoles: uniqueSorted([
          requiredRoleMatch?.[1],
          ...(requiredRolesMatch?.[1]?.match(/["']([^"']+)["']/g)?.map((value) => value.slice(1, -1)) ?? []),
        ]),
        featureGate: featureMatch?.[1] ? compact(featureMatch[1]) : null,
        redirectTo: redirectMatch ? compact(redirectMatch[1] ?? redirectMatch[2]) : null,
        source: relativePath,
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return routes.sort((a, b) => a.line - b.line);
}

function literalValue(node, sourceFile) {
  if (!node) return null;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (ts.isArrayLiteralExpression(node)) return node.elements.map((element) => literalValue(element, sourceFile));
  return compact(node.getText(sourceFile));
}

function parseFeatureFlags(root, digestSources) {
  const relativePath = "src/lib/featureCatalog.ts";
  const source = readUtf8(root, relativePath, digestSources);
  const sourceFile = ts.createSourceFile(relativePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const flags = [];
  const visit = (node) => {
    if (
      ts.isVariableDeclaration(node)
      && ts.isIdentifier(node.name)
      && node.name.text === "FEATURE_DEFINITIONS"
      && node.initializer
      && ts.isArrayLiteralExpression(node.initializer)
    ) {
      for (const element of node.initializer.elements) {
        if (!ts.isObjectLiteralExpression(element)) continue;
        const definition = { source: relativePath, line: lineAt(sourceFile, element) };
        for (const property of element.properties) {
          if (!ts.isPropertyAssignment(property)) continue;
          const key = property.name.getText(sourceFile).replace(/^['"]|['"]$/g, "");
          definition[key] = literalValue(property.initializer, sourceFile);
        }
        if (definition.name) flags.push(definition);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return flags;
}

function scriptKindFor(file) {
  if (file.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (file.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if ([".js", ".mjs", ".cjs"].some((extension) => file.endsWith(extension))) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function collectExports(sourceFile) {
  const exportedItems = [];
  for (const statement of sourceFile.statements) {
    const modifiers = ts.canHaveModifiers(statement) ? ts.getModifiers(statement) ?? [] : [];
    const exported = modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
    const isDefault = modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword);
    if (ts.isExportAssignment(statement)) {
      exportedItems.push({ name: "default", line: lineAt(sourceFile, statement), kind: "default" });
    }
    if (ts.isExportDeclaration(statement)) {
      if (statement.exportClause && ts.isNamedExports(statement.exportClause)) {
        for (const element of statement.exportClause.elements) {
          exportedItems.push({ name: element.name.text, line: lineAt(sourceFile, element), kind: "re-export" });
        }
      } else {
        exportedItems.push({ name: "*", line: lineAt(sourceFile, statement), kind: "re-export" });
      }
    }
    if (!exported) continue;
    const kind = ts.SyntaxKind[statement.kind].replace(/Declaration$|Statement$/, "").toLowerCase();
    if ("name" in statement && statement.name && ts.isIdentifier(statement.name)) {
      exportedItems.push({ name: isDefault ? "default" : statement.name.text, line: lineAt(sourceFile, statement), kind });
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) {
          exportedItems.push({ name: declaration.name.text, line: lineAt(sourceFile, declaration), kind: "variable" });
        }
      }
    }
  }
  return exportedItems;
}

function extractEnvironmentNames(source) {
  const names = [];
  const patterns = [
    /Deno\.env\.get\(\s*["']([A-Z][A-Z0-9_]*)["']\s*\)/g,
    /process\.env(?:\.([A-Z][A-Z0-9_]*)|\[\s*["']([A-Z][A-Z0-9_]*)["']\s*\])/g,
    /import\.meta\.env\.([A-Z][A-Z0-9_]*)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) names.push(match[1] ?? match[2]);
  }
  return uniqueSorted(names);
}

function extractIntegrations(source) {
  const lower = source.toLowerCase();
  return INTEGRATIONS.filter((integration) => lower.includes(integration));
}

function extractPathLiterals(sourceFile) {
  const items = [];
  const visit = (node) => {
    if (
      (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
      && /^\/(?!\/)[^\s<>]{0,240}$/.test(node.text)
    ) {
      items.push({ value: node.text, line: lineAt(sourceFile, node) });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return items;
}

function extractQueryParameters(source, sourceFile) {
  if (!/(?:useSearchParams|URLSearchParams|location\.search|searchParams|new URL\s*\()/m.test(source)) return [];

  const parameterOwners = new Set(["searchParams"]);
  const urlOwners = new Set();
  const methods = new Set(["get", "has", "set", "append", "delete", "getAll", "sort"]);
  const items = [];

  const unwrap = (node) => {
    let current = node;
    while (
      current
      && (ts.isParenthesizedExpression(current)
        || ts.isAsExpression(current)
        || ts.isSatisfiesExpression(current)
        || ts.isNonNullExpression(current))
    ) current = current.expression;
    return current;
  };

  const isCallNamed = (node, name) => (
    ts.isCallExpression(node)
    && ((ts.isIdentifier(node.expression) && node.expression.text === name)
      || (ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === name))
  );

  // First discover the identifiers that actually contain URL or URLSearchParams
  // instances. This avoids treating Headers, Map and Deno.env lookups as URL
  // parameters merely because the same file also mentions searchParams.
  const discoverOwners = (node) => {
    if (ts.isVariableDeclaration(node) && node.initializer) {
      const initializer = unwrap(node.initializer);
      if (ts.isIdentifier(node.name)) {
        if (
          ts.isNewExpression(initializer)
          && ts.isIdentifier(initializer.expression)
          && initializer.expression.text === "URLSearchParams"
          && initializer.arguments?.[0]
          && /(?:^|\.)(?:search|searchParams)$/.test(compact(initializer.arguments[0].getText(sourceFile)))
        ) parameterOwners.add(node.name.text);
        if (
          ts.isNewExpression(initializer)
          && ts.isIdentifier(initializer.expression)
          && initializer.expression.text === "URL"
        ) urlOwners.add(node.name.text);
        if (
          ts.isPropertyAccessExpression(initializer)
          && initializer.name.text === "searchParams"
        ) parameterOwners.add(node.name.text);
      }
      if (
        ts.isArrayBindingPattern(node.name)
        && isCallNamed(initializer, "useSearchParams")
        && node.name.elements[0]
        && ts.isBindingElement(node.name.elements[0])
        && ts.isIdentifier(node.name.elements[0].name)
      ) parameterOwners.add(node.name.elements[0].name.text);
    }
    ts.forEachChild(node, discoverOwners);
  };
  discoverOwners(sourceFile);

  const isSearchParamsExpression = (node) => {
    const expression = unwrap(node);
    if (ts.isIdentifier(expression)) return parameterOwners.has(expression.text);
    if (ts.isPropertyAccessExpression(expression) && expression.name.text === "searchParams") {
      const owner = unwrap(expression.expression);
      return !ts.isIdentifier(owner) || urlOwners.has(owner.text) || owner.text === "location";
    }
    return false;
  };

  const visit = (node) => {
    if (
      ts.isCallExpression(node)
      && ts.isPropertyAccessExpression(node.expression)
      && methods.has(node.expression.name.text)
      && isSearchParamsExpression(node.expression.expression)
      && node.arguments[0]
      && (ts.isStringLiteral(node.arguments[0]) || ts.isNoSubstitutionTemplateLiteral(node.arguments[0]))
    ) {
      items.push({ name: node.arguments[0].text, line: lineAt(sourceFile, node.arguments[0]) });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return items;
}

function parseCodeModules(root, repositoryFiles, digestSources) {
  return repositoryFiles
    .filter((file) => CODE_EXTENSIONS.has(path.posix.extname(file)) && !GENERATED_PATHS.has(file))
    .map((file) => {
      const source = readUtf8(root, file, digestSources);
      const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, scriptKindFor(file));
      return {
        path: file,
        exports: collectExports(sourceFile),
        environmentNames: extractEnvironmentNames(source),
        integrations: extractIntegrations(source),
        pathLiterals: extractPathLiterals(sourceFile),
        queryParameters: extractQueryParameters(source, sourceFile),
        lineCount: source ? source.split("\n").length : 0,
      };
    });
}

function parsePages(repositoryFiles, modules, frontendRoutes) {
  const moduleMap = new Map(modules.map((module) => [module.path, module]));
  return repositoryFiles
    .filter((file) => file.startsWith("src/pages/") && CODE_EXTENSIONS.has(path.posix.extname(file)))
    .map((file) => {
      const module = moduleMap.get(file);
      const routes = frontendRoutes.filter((route) => route.pageSources.includes(file)).map((route) => route.path);
      return {
        name: humanize(path.posix.basename(file)),
        path: file,
        routes,
        mounted: routes.length > 0,
        exports: module?.exports ?? [],
        integrations: module?.integrations ?? [],
      };
    });
}

function functionDeclarations(sourceFile) {
  const declarations = new Map();
  const visit = (node) => {
    if (ts.isFunctionDeclaration(node) && node.name) declarations.set(node.name.text, node);
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) declarations.set(node.name.text, node);
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return declarations;
}

function inferMethodsFromFunction(sourceFile, declarations, startName) {
  const extractAllowedMethods = (declaration) => {
    const methods = new Set();
    const text = declaration?.getText(sourceFile) ?? "";
    for (const match of text.matchAll(/methodNotAllowed\s*\([\s\S]{0,120}?\[([^\]]+)\]/g)) {
      for (const method of match[1].matchAll(/["'](GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)["']/g)) {
        methods.add(method[1]);
      }
    }
    return methods;
  };
  const handler = declarations.get(startName);
  if (!handler) return [];
  const direct = extractAllowedMethods(handler);
  if (direct.size) return [...direct].sort();

  const calledNames = new Set();
  const visitCalls = (node) => {
    if (ts.isCallExpression(node)) calledNames.add(node.expression.getText(sourceFile).split(".").at(-1));
    ts.forEachChild(node, visitCalls);
  };
  visitCalls(handler);
  const delegated = new Set();
  for (const calledName of calledNames) {
    for (const method of extractAllowedMethods(declarations.get(calledName))) delegated.add(method);
  }
  return [...delegated].sort();
}

function parseApiRoutes(root, repositoryFiles, digestSources) {
  const serverPath = "server/marketingBff.ts";
  const serverSource = readUtf8(root, serverPath, digestSources);
  const serverFile = ts.createSourceFile(serverPath, serverSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const declarations = functionDeclarations(serverFile);
  return repositoryFiles
    .filter((file) => file.startsWith("api/") && CODE_EXTENSIONS.has(path.posix.extname(file)))
    .map((file) => {
      const source = readUtf8(root, file, digestSources);
      const handler = source.match(/\b(marketing[A-Za-z0-9]+Handler)\b/)?.[1] ?? null;
      const methods = handler ? inferMethodsFromFunction(serverFile, declarations, handler) : [];
      return {
        route: `/${file.replace(/\.[^.]+$/, "").replace(/\/index$/, "")}`,
        path: file,
        handler,
        methods: methods.length ? methods : ["ANY"],
        integrations: uniqueSorted([...extractIntegrations(source), ...extractIntegrations(serverSource)]),
      };
    });
}

function parseFunctionConfig(root, digestSources) {
  const relativePath = "supabase/config.toml";
  const source = readUtf8(root, relativePath, digestSources);
  const configs = new Map();
  let current = null;
  source.split("\n").forEach((line, index) => {
    const section = line.match(/^\[functions\.([^\]]+)\]/);
    if (section) {
      current = section[1];
      configs.set(current, { name: current, line: index + 1, verifyJwt: null });
      return;
    }
    const verify = line.match(/^verify_jwt\s*=\s*(true|false)/);
    if (current && verify) configs.get(current).verifyJwt = verify[1] === "true";
  });
  return configs;
}

function inferHttpMethods(source) {
  const methods = new Set();
  for (const match of source.matchAll(/(?:req(?:uest)?\.method|method)[^\n]{0,80}?["'](GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)["']/gi)) {
    methods.add(match[1].toUpperCase());
  }
  return methods.size ? [...methods].sort() : ["ANY"];
}

function inferActions(source, fileName) {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, scriptKindFor(fileName));
  const actions = [];
  const isActionExpression = (node) => /(?:^|\.)(?:action|operation)$/i.test(compact(node.getText(sourceFile)));
  const isEquality = (kind) => new Set([
    ts.SyntaxKind.EqualsEqualsEqualsToken,
    ts.SyntaxKind.EqualsEqualsToken,
  ]).has(kind);
  const visit = (node) => {
    if (ts.isBinaryExpression(node) && isEquality(node.operatorToken.kind)) {
      const pairs = [[node.left, node.right], [node.right, node.left]];
      for (const [candidate, literal] of pairs) {
        if (
          isActionExpression(candidate)
          && (ts.isStringLiteral(literal) || ts.isNoSubstitutionTemplateLiteral(literal))
          && /^[a-z][a-z0-9_-]{2,}$/i.test(literal.text)
        ) actions.push(literal.text);
      }
    }
    if (ts.isSwitchStatement(node) && isActionExpression(node.expression)) {
      for (const clause of node.caseBlock.clauses) {
        if (
          ts.isCaseClause(clause)
          && (ts.isStringLiteral(clause.expression) || ts.isNoSubstitutionTemplateLiteral(clause.expression))
          && /^[a-z][a-z0-9_-]{2,}$/i.test(clause.expression.text)
        ) actions.push(clause.expression.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return uniqueSorted(actions).slice(0, 80);
}

function parseEdgeFunctions(root, repositoryFiles, digestSources) {
  const configs = parseFunctionConfig(root, digestSources);
  const sourceNames = repositoryFiles
    .filter((file) => /^supabase\/functions\/[^/]+\/index\.(?:ts|js)$/.test(file))
    .map((file) => file.split("/")[2]);
  return uniqueSorted([...configs.keys(), ...sourceNames]).map((name) => {
    const sourcePath = repositoryFiles.find((file) => file === `supabase/functions/${name}/index.ts`
      || file === `supabase/functions/${name}/index.js`) ?? null;
    const source = sourcePath ? readUtf8(root, sourcePath, digestSources) : "";
    const config = configs.get(name);
    return {
      name,
      endpoint: `/functions/v1/${name}`,
      path: sourcePath,
      configPath: config ? "supabase/config.toml" : null,
      configLine: config?.line ?? null,
      verifyJwt: config?.verifyJwt ?? null,
      methods: source ? inferHttpMethods(source) : [],
      actions: source ? inferActions(source, sourcePath) : [],
      environmentNames: source ? extractEnvironmentNames(source) : [],
      integrations: source ? extractIntegrations(source) : [],
      configured: Boolean(config),
      sourcePresent: Boolean(sourcePath),
    };
  });
}

const normalizeHttpRoute = (value) => value.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, ":$1");

function parseEdgeHttpRoutes(root, edgeFunctions, digestSources) {
  const routes = new Map();
  const addRoute = (fn, method, route, line) => {
    const normalizedRoute = normalizeHttpRoute(route);
    const key = `${fn.name}:${method}:${normalizedRoute}`;
    if (!routes.has(key)) {
      routes.set(key, {
        function: fn.name,
        method,
        route: normalizedRoute,
        endpoint: `${fn.endpoint}${normalizedRoute === "/" ? "" : normalizedRoute}`,
        parameters: [...normalizedRoute.matchAll(/:([A-Za-z_][A-Za-z0-9_]*)/g)].map((match) => match[1]),
        path: fn.path,
        line,
      });
    }
  };

  for (const fn of edgeFunctions.filter((item) => item.path)) {
    const source = readUtf8(root, fn.path, digestSources);

    // Structured response metadata is authoritative for the TOK Connect
    // dispatcher and keeps dynamic path parameters explicit.
    for (const match of source.matchAll(/\broute\s*:\s*["'](GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(\/[^"']+)["']/g)) {
      addRoute(fn, match[1], match[2], source.slice(0, match.index).split("\n").length);
    }

    // Direct method/path dispatchers.
    for (const match of source.matchAll(/req(?:uest)?\.method\s*===\s*["'](GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)["'][\s\S]{0,100}?\bpath\s*===\s*["'](\/[^"']+)["']/g)) {
      addRoute(fn, match[1], match[2], source.slice(0, match.index).split("\n").length);
    }

    // Named route registries such as Google Actions Center's ROUTES object.
    const namedRoutes = new Map();
    const routeObject = source.match(/\bconst\s+ROUTES\s*=\s*\{([\s\S]*?)\}\s*as\s+const\s*;/);
    if (routeObject) {
      for (const match of routeObject[1].matchAll(/([A-Za-z_][A-Za-z0-9_]*)\s*:\s*["'](\/[^"']+)["']/g)) {
        namedRoutes.set(match[1], match[2]);
      }
    }
    for (const match of source.matchAll(/req(?:uest)?\.method\s*===\s*["'](GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)["'][\s\S]{0,100}?\bpath\s*===\s*ROUTES\.([A-Za-z_][A-Za-z0-9_]*)/g)) {
      const route = namedRoutes.get(match[2]);
      if (route) addRoute(fn, match[1], route, source.slice(0, match.index).split("\n").length);
    }
  }

  return [...routes.values()].sort((a, b) => compareText(
    `${a.function}:${a.route}:${a.method}`,
    `${b.function}:${b.route}:${b.method}`,
  ));
}

const cleanSqlIdentifier = (value) => value.replaceAll('"', "").replace(/[;(].*$/, "").trim();

function parseMigrationObjects(source, migrationPath) {
  const objects = [];
  const patterns = [
    ["table", /CREATE\s+(?:UNLOGGED\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([\w".]+)/gi],
    ["materialized-view", /CREATE\s+MATERIALIZED\s+VIEW\s+(?:IF\s+NOT\s+EXISTS\s+)?([\w".]+)/gi],
    ["view", /CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+([\w".]+)/gi],
    ["function", /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+([\w".]+)/gi],
    ["type", /CREATE\s+TYPE\s+([\w".]+)/gi],
    ["policy", /CREATE\s+POLICY\s+(?:"([^"]+)"|([\w.-]+))\s+ON\s+([\w".]+)/gi],
    ["index", /CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?([\w".]+)/gi],
    ["trigger", /CREATE\s+(?:OR\s+REPLACE\s+)?TRIGGER\s+([\w".]+)/gi],
  ];
  for (const [type, pattern] of patterns) {
    for (const match of source.matchAll(pattern)) {
      const name = type === "policy"
        ? `${cleanSqlIdentifier(match[3])}.${cleanSqlIdentifier(match[1] ?? match[2])}`
        : cleanSqlIdentifier(match[1]);
      objects.push({
        type,
        name,
        migration: migrationPath,
        line: source.slice(0, match.index).split("\n").length,
      });
    }
  }
  return objects;
}

function parseMigrations(root, repositoryFiles, digestSources) {
  const migrations = [];
  const objectMap = new Map();
  const cronMap = new Map();
  const bucketMap = new Map();
  for (const file of repositoryFiles.filter((candidate) => /^supabase\/migrations\/.*\.sql$/.test(candidate))) {
    const source = readUtf8(root, file, digestSources);
    const objects = parseMigrationObjects(source, file);
    migrations.push({
      name: humanize(path.posix.basename(file)),
      path: file,
      lineCount: source ? source.split("\n").length : 0,
      objectCount: objects.length,
    });
    for (const object of objects) {
      const key = `${object.type}:${object.name.toLowerCase()}`;
      const current = objectMap.get(key) ?? { type: object.type, name: object.name, sources: [] };
      current.sources.push({ path: object.migration, line: object.line });
      objectMap.set(key, current);
    }
    for (const match of source.matchAll(/cron\.schedule\s*\(\s*["']([^"']+)["']\s*,\s*["']([^"']+)["']/gi)) {
      const name = match[1];
      const current = cronMap.get(name) ?? { name, schedules: [], sources: [] };
      current.schedules.push(match[2]);
      current.sources.push({ path: file, line: source.slice(0, match.index).split("\n").length });
      cronMap.set(name, current);
    }
    for (const match of source.matchAll(/INSERT\s+INTO\s+storage\.buckets[\s\S]{0,400}?VALUES\s*\(\s*["']([^"']+)["']/gi)) {
      const name = match[1];
      const current = bucketMap.get(name) ?? { name, sources: [] };
      current.sources.push({ path: file, line: source.slice(0, match.index).split("\n").length });
      bucketMap.set(name, current);
    }
  }
  return {
    migrations,
    databaseObjects: [...objectMap.values()].sort(
      (a, b) => compareText(`${a.type}:${a.name}`, `${b.type}:${b.name}`),
    ),
    cronJobs: [...cronMap.values()]
      .map((item) => ({ ...item, schedules: uniqueSorted(item.schedules) }))
      .sort((a, b) => compareText(a.name, b.name)),
    storageBuckets: [...bucketMap.values()].sort((a, b) => compareText(a.name, b.name)),
  };
}

function parseNamedStringArrays(sourceFile, names) {
  const values = [];
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !names.has(declaration.name.text) || !declaration.initializer) {
        continue;
      }
      let initializer = declaration.initializer;
      while (
        ts.isAsExpression(initializer)
        || ts.isSatisfiesExpression(initializer)
        || ts.isParenthesizedExpression(initializer)
      ) initializer = initializer.expression;
      if (!ts.isArrayLiteralExpression(initializer)) continue;
      for (const element of initializer.elements) {
        if (ts.isStringLiteral(element)) {
          values.push({ name: element.text, group: declaration.name.text, line: lineAt(sourceFile, element) });
        }
      }
    }
  }
  return values;
}

function parseMarketingOperations(root, digestSources) {
  const relativePath = "server/marketingBff.ts";
  const source = readUtf8(root, relativePath, digestSources);
  const sourceFile = ts.createSourceFile(relativePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  return parseNamedStringArrays(sourceFile, new Set([
    "MARKETING_OPERATION_NAMES",
    "MARKETING_OUTREACH_OPERATION_NAMES",
    "MARKETING_AUTOPILOT_OPERATION_NAMES",
  ])).map((item) => ({ ...item, path: relativePath }));
}

function parsePublicRoutes(repositoryFiles) {
  const classify = (relative) => {
    const extension = path.posix.extname(relative).toLowerCase();
    if (relative.endsWith("/index.html") || extension === ".html") return "navigable";
    if (
      relative.startsWith(".well-known/")
      || relative === "manifest.json"
      || relative === "robots.txt"
      || relative === "sw.js"
      || /^sitemap[^/]*\.xml$/i.test(relative)
    ) return "platform";
    if ([".json", ".xml", ".txt", ".csv", ".geojson"].includes(extension)) return "data";
    if ([
      ".avif", ".gif", ".ico", ".jpeg", ".jpg", ".mp3", ".mp4", ".ogg",
      ".otf", ".pdf", ".png", ".svg", ".ttf", ".wav", ".webm", ".webp", ".woff", ".woff2",
    ].includes(extension)) return "media";
    return "other";
  };
  return repositoryFiles
    .filter((file) => file.startsWith("public/") && !file.endsWith("/"))
    .map((file) => {
      const relative = file.slice("public/".length);
      const route = relative.endsWith("/index.html")
        ? `/${relative.slice(0, -"index.html".length)}`
        : `/${relative}`;
      return { route, path: file, kind: classify(relative) };
    });
}

function parseRoutingAuthorities(root, repositoryFiles, digestSources) {
  const authorityFiles = [
    "src/lib/adminDomains.ts",
    "src/lib/authDomains.ts",
    "src/lib/marketingDomains.ts",
    "src/lib/commercialDomains.ts",
    "src/lib/demoWorkspaces.ts",
    "src/lib/commercialDemoFrame.ts",
    "src/lib/mobile-domains.ts",
    "src/lib/navigation.ts",
    "src/lib/push-native.ts",
    "src/lib/notificationRouting.ts",
    "src/lib/tokConnect.ts",
    "capacitor.config.ts",
    "android/app/src/main/AndroidManifest.xml",
    "ios/App/App/Info.plist",
    "ios/App/App/App.entitlements",
  ].filter((file) => repositoryFiles.includes(file));
  const values = new Map();
  const add = (kind, value, sourcePath, line, metadata = {}) => {
    const key = `${kind}:${value}`;
    const current = values.get(key) ?? { kind, value, sources: [], ...metadata };
    current.sources.push({ path: sourcePath, line });
    values.set(key, current);
  };

  for (const file of authorityFiles) {
    const source = readUtf8(root, file, digestSources);
    const lineFor = (index) => source.slice(0, index).split("\n").length;
    for (const match of source.matchAll(/\btok:\/\/[A-Za-z0-9_./{}:-]+/g)) {
      add("deep-link", match[0], file, lineFor(match.index), { scheme: "tok" });
    }
    for (const match of source.matchAll(/\b(?:[a-z0-9-]+\.)*thetok\.ch\b/gi)) {
      add("application-host", match[0].toLowerCase(), file, lineFor(match.index));
    }
    for (const match of source.matchAll(/<string>applinks:([^<]+)<\/string>/g)) {
      add("ios-universal-link", match[1], file, lineFor(match.index), { scheme: "https" });
    }
    for (const match of source.matchAll(/android:scheme="([^"]+)"/g)) {
      add("android-scheme", `${match[1]}://*`, file, lineFor(match.index), { scheme: match[1] });
    }
    for (const match of source.matchAll(/android:host="([^"]+)"/g)) {
      add("android-app-link", match[1].toLowerCase(), file, lineFor(match.index), { scheme: "https" });
    }
    for (const match of source.matchAll(/\bscheme\s*:\s*["']([^"']+)["']/g)) {
      add("capacitor-scheme", `${match[1]}://*`, file, lineFor(match.index), { scheme: match[1] });
    }
  }

  const framePath = "src/lib/commercialDemoFrame.ts";
  if (repositoryFiles.includes(framePath)) {
    add(
      "commercial-frame",
      "/commercial/demo-live/frame/:surface/:sessionId/*",
      framePath,
      1,
      { sessionScoped: true },
    );
  }

  const manifestPath = "public/manifest.json";
  const shortcuts = [];
  if (repositoryFiles.includes(manifestPath)) {
    const source = readUtf8(root, manifestPath, digestSources);
    const manifest = JSON.parse(source);
    for (const shortcut of manifest.shortcuts ?? []) {
      const line = source.slice(0, source.indexOf(`"url": "${shortcut.url}"`)).split("\n").length;
      const item = {
        kind: "pwa-shortcut",
        value: shortcut.url,
        name: shortcut.name,
        description: shortcut.description ?? null,
        sources: [{ path: manifestPath, line }],
      };
      shortcuts.push(item);
      values.set(`${item.kind}:${item.value}`, item);
    }
  }

  return {
    authorities: [...values.values()].sort((a, b) => compareText(`${a.kind}:${a.value}`, `${b.kind}:${b.value}`)),
    shortcuts,
  };
}

function parseWorkerRoutes(root, repositoryFiles, digestSources) {
  const routes = [];
  for (const file of repositoryFiles.filter((candidate) => /^workers\/[^/]+\/.*\.(?:js|mjs|ts)$/.test(candidate))) {
    const source = readUtf8(root, file, digestSources);
    for (const match of source.matchAll(/request\.url\s*===\s*["'](\/[^"']+)["']/g)) {
      routes.push({
        worker: file.split("/")[1],
        method: "ANY",
        route: match[1],
        path: file,
        line: source.slice(0, match.index).split("\n").length,
      });
    }
  }
  const unique = new Map(routes.map((item) => [`${item.worker}:${item.method}:${item.route}`, item]));
  return [...unique.values()].sort((a, b) => compareText(`${a.worker}:${a.route}`, `${b.worker}:${b.route}`));
}

function parseSeoBuildRoutes(root, repositoryFiles, digestSources) {
  const sourcePath = "scripts/prerender-seo.mjs";
  if (!repositoryFiles.includes(sourcePath)) return { routes: [], generatedArtifacts: [] };
  const source = readUtf8(root, sourcePath, digestSources);
  const sourceFile = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const routes = new Map();
  const add = (route, node, kind) => {
    if (!route.startsWith("/") || route.length > 240 || /\s/.test(route)) return;
    const normalized = route.replace(/\?.*$/, "");
    const key = `${kind}:${normalized}`;
    if (!routes.has(key)) routes.set(key, {
      route: normalized,
      kind,
      generatedAtBuild: true,
      indexability: "data-dependent",
      path: sourcePath,
      line: lineAt(sourceFile, node),
    });
  };
  const visit = (node) => {
    if (
      ts.isPropertyAssignment(node)
      && node.name.getText(sourceFile).replace(/["']/g, "") === "path"
      && (ts.isStringLiteral(node.initializer) || ts.isNoSubstitutionTemplateLiteral(node.initializer))
    ) add(node.initializer.text, node.initializer, "static");
    if (ts.isTemplateExpression(node) && node.head.text.startsWith("/")) {
      let route = node.head.text;
      node.templateSpans.forEach((span, index) => {
        const expression = compact(span.expression.getText(sourceFile));
        const parameter = expression.match(/[A-Za-z_][A-Za-z0-9_]*$/)?.[0] ?? `param${index + 1}`;
        route += `:${parameter}${span.literal.text}`;
      });
      add(route, node, "dynamic-template");
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return {
    routes: [...routes.values()].sort((a, b) => compareText(`${a.kind}:${a.route}`, `${b.kind}:${b.route}`)),
    generatedArtifacts: [
      {
        path: "dist/**/index.html",
        createdBy: "scripts/prerender-seo.mjs",
        tracked: false,
        note: "Inventaire HTML exact dépendant des données disponibles pendant build:prod.",
      },
      {
        path: ".vercel/stoppin-venue-redirects.json",
        createdBy: "scripts/apply-stoppin-venue-redirects.mjs",
        tracked: false,
        note: "Redirections d’alias Stoppin calculées et validées pendant build:prod.",
      },
    ],
  };
}

function aggregateModulePaths(rawModules, frontendRoutes, edgeHttpRoutes, pwaShortcuts) {
  const pathMap = new Map();
  const queryMap = new Map();
  const routesBySource = new Map();
  const addSourceRoute = (sourcePath, route) => {
    const current = routesBySource.get(sourcePath) ?? new Set();
    current.add(route);
    routesBySource.set(sourcePath, current);
  };
  for (const route of frontendRoutes) {
    addSourceRoute(route.source, route.path);
    for (const pageSource of route.pageSources) addSourceRoute(pageSource, route.path);
  }
  for (const route of edgeHttpRoutes) addSourceRoute(route.path, route.route);
  for (const module of rawModules) {
    for (const item of module.pathLiterals) {
      const current = pathMap.get(item.value) ?? { value: item.value, sources: [] };
      current.sources.push({ path: module.path, line: item.line });
      pathMap.set(item.value, current);
    }
    for (const item of module.queryParameters) {
      const current = queryMap.get(item.name) ?? { name: item.name, sources: [], routes: [] };
      current.sources.push({ path: module.path, line: item.line });
      current.routes.push(...(routesBySource.get(module.path) ?? []));
      queryMap.set(item.name, current);
    }
  }
  for (const shortcut of pwaShortcuts) {
    const query = shortcut.value.includes("?") ? shortcut.value.slice(shortcut.value.indexOf("?") + 1) : "";
    for (const name of new URLSearchParams(query).keys()) {
      const current = queryMap.get(name) ?? { name, sources: [], routes: [] };
      current.sources.push(shortcut.sources[0]);
      current.routes.push(shortcut.value.split("?")[0]);
      queryMap.set(name, current);
    }
  }
  return {
    pathLiterals: [...pathMap.values()].sort((a, b) => compareText(a.value, b.value)),
    queryParameters: [...queryMap.values()]
      .map((item) => ({ ...item, routes: uniqueSorted(item.routes) }))
      .sort((a, b) => compareText(a.name, b.name)),
    modules: rawModules.map(({ pathLiterals: _paths, queryParameters: _queries, ...module }) => module),
  };
}

function extractTypeSection(source, name) {
  const marker = `    ${name}: {`;
  const start = source.indexOf(marker);
  if (start < 0) return [];
  const braceStart = source.indexOf("{", start);
  let depth = 0;
  let end = source.length;
  for (let index = braceStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) {
        end = index;
        break;
      }
    }
  }
  const section = source.slice(braceStart + 1, end);
  return [...section.matchAll(/^      ([A-Za-z0-9_]+):/gm)].map((match) => ({
    name: match[1],
    line: source.slice(0, braceStart + 1 + match.index).split("\n").length,
  }));
}

function parseDatabaseContract(root, digestSources) {
  const relativePath = "src/integrations/supabase/types.ts";
  const source = readUtf8(root, relativePath, digestSources);
  return ["Tables", "Views", "Functions", "Enums"].flatMap((section) => (
    extractTypeSection(source, section).map((item) => ({
      ...item,
      kind: section === "Functions" ? "rpc" : section.slice(0, -1).toLowerCase(),
      path: relativePath,
    }))
  ));
}

function parseRuntimeEvidence(root, digestSources) {
  return JSON.parse(readUtf8(root, RUNTIME_EVIDENCE_PATH, digestSources));
}

function parseDeploymentRules(root, digestSources) {
  const vercelPath = "vercel.json";
  const vercel = JSON.parse(readUtf8(root, vercelPath, digestSources));
  const mapRule = (item, index) => ({
    ...item,
    host: item.has?.find((condition) => condition.type === "host")?.value ?? null,
    path: vercelPath,
    ordinal: index + 1,
  });
  const redirects = (vercel.redirects ?? []).map(mapRule);
  const rewrites = (vercel.rewrites ?? []).map(mapRule);
  const headers = (vercel.headers ?? []).map((item, index) => ({
    source: item.source,
    host: item.has?.find((condition) => condition.type === "host")?.value ?? null,
    keys: (item.headers ?? []).map((header) => header.key),
    path: vercelPath,
    ordinal: index + 1,
  }));
  const middlewarePath = "middleware.js";
  const middlewareSource = readUtf8(root, middlewarePath, digestSources);
  const matcher = middlewareSource.match(/matcher:\s*["']([^"']+)["']/)?.[1] ?? null;
  return { redirects, rewrites, headers, middleware: { path: middlewarePath, matcher } };
}

function parsePackage(root, digestSources) {
  const packagePath = "package.json";
  const manifest = JSON.parse(readUtf8(root, packagePath, digestSources));
  const scripts = Object.entries(manifest.scripts ?? {}).map(([name, command]) => ({
    name,
    command,
    path: packagePath,
  }));
  const dependencies = [
    ...Object.entries(manifest.dependencies ?? {}).map(([name, version]) => ({
      name,
      version,
      kind: "runtime",
      path: packagePath,
    })),
    ...Object.entries(manifest.devDependencies ?? {}).map(([name, version]) => ({
      name,
      version,
      kind: "development",
      path: packagePath,
    })),
  ].sort((a, b) => compareText(a.name, b.name));
  return {
    scripts,
    dependencies,
    packageManager: manifest.packageManager ?? null,
    engines: manifest.engines ?? {},
  };
}

function parseWorkflows(root, repositoryFiles, digestSources) {
  return repositoryFiles
    .filter((file) => /^\.github\/workflows\/.*\.ya?ml$/.test(file))
    .map((file) => {
      const source = readUtf8(root, file, digestSources);
      const name = source.match(/^name:\s*(.+)$/m)?.[1]?.trim().replace(/^['"]|['"]$/g, "")
        ?? humanize(path.posix.basename(file));
      const jobsBlock = source.split(/^jobs:\s*$/m)[1] ?? "";
      const jobs = uniqueSorted([...jobsBlock.matchAll(/^  ([A-Za-z0-9_-]+):\s*$/gm)].map((match) => match[1]));
      return { name, path: file, jobs };
    });
}

function parseDocuments(root, repositoryFiles, digestSources) {
  return repositoryFiles
    .filter((file) => file.endsWith(".md") && !GENERATED_PATHS.has(file))
    .map((file) => {
      const source = readUtf8(root, file, digestSources);
      const headings = [...source.matchAll(/^(#{1,6})\s+(.+)$/gm)].map((match) => ({
        level: match[1].length,
        title: compact(match[2].replace(/\s+#+$/, "")),
        line: source.slice(0, match.index).split("\n").length,
      }));
      return {
        path: file,
        title: headings[0]?.title ?? humanize(path.posix.basename(file)),
        headings,
      };
    });
}

function classifyFile(file) {
  if (GENERATED_PATHS.has(file)) return "generated-reference";
  if (/\.test\.[^.]+$|\.spec\.[^.]+$/.test(file)) return "test";
  if (file.startsWith("src/pages/")) return "frontend-page";
  if (file.startsWith("src/components/")) return "frontend-component";
  if (file.startsWith("src/hooks/")) return "frontend-hook";
  if (file.startsWith("src/lib/")) return "application-library";
  if (file.startsWith("src/")) return "frontend-source";
  if (file.startsWith("api/")) return "vercel-api";
  if (file.startsWith("server/")) return "server-source";
  if (file.startsWith("supabase/functions/")) return "edge-function-source";
  if (file.startsWith("supabase/migrations/")) return "database-migration";
  if (file.startsWith("supabase/")) return "supabase-configuration";
  if (file.startsWith(".github/workflows/")) return "ci-workflow";
  if (file.startsWith("docs/")) return "documentation";
  if (file.startsWith("scripts/")) return "automation-script";
  if (file.startsWith("public/")) return "public-asset";
  if (file.startsWith("android/")) return "android";
  if (file.startsWith("ios/")) return "ios";
  if (file.startsWith("workers/")) return "worker";
  return "repository-file";
}

function parseFiles(repositoryFiles) {
  return repositoryFiles.map((file) => ({
    path: file,
    category: classifyFile(file),
    extension: path.posix.extname(file) || "(none)",
  }));
}

function record(type, title, description, options = {}) {
  const pathValue = options.path ?? null;
  const line = options.line ?? null;
  const result = {
    id: makeId(type, pathValue ?? "", String(line ?? ""), title),
    type,
    title,
    description: compact(description),
    path: pathValue,
    line,
    surface: options.surface ?? null,
    tags: uniqueSorted(options.tags ?? []),
  };
  if (options.details) result.detailRef = shortHash(JSON.stringify(options.details));
  return result;
}

function buildRecords(catalogs) {
  const records = [];
  for (const route of catalogs.frontendRoutes) {
    records.push(record(
      "frontend-route",
      route.path,
      route.redirectTo
        ? `Redirection vers ${route.redirectTo}.`
        : `Route ${route.surface} rendue par ${route.components.join(", ") || "un élément dynamique"}.`,
      {
        path: route.source,
        line: route.line,
        surface: route.surface,
        tags: [...route.guards, ...route.requiredRoles, route.featureGate, ...route.components],
        details: route,
      },
    ));
  }
  for (const page of catalogs.pages) {
    records.push(record(
      "page",
      page.name,
      page.mounted
        ? `Page montée sur ${page.routes.join(", ")}.`
        : "Module de page non monté directement dans le registre principal.",
      { path: page.path, tags: [...page.routes, ...page.integrations], details: page },
    ));
  }
  for (const flag of catalogs.featureFlags) {
    records.push(record("feature-flag", flag.label ?? flag.name, flag.description, {
      path: flag.source,
      line: flag.line,
      tags: [
        flag.name,
        flag.group,
        ...(flag.routeTargets ?? []),
        flag.defaultEnabled ? "enabled-by-default" : "disabled-by-default",
      ],
      details: flag,
    }));
  }
  for (const apiRoute of catalogs.apiRoutes) {
    records.push(record(
      "api-route",
      apiRoute.route,
      `API Vercel ${apiRoute.methods.join(", ")} déléguée à ${apiRoute.handler ?? "un handler local"}.`,
      {
        path: apiRoute.path,
        tags: [...apiRoute.methods, ...apiRoute.integrations],
        details: apiRoute,
      },
    ));
  }
  for (const fn of catalogs.edgeFunctions) {
    records.push(record(
      "edge-function",
      fn.name,
      `Fonction Edge ${fn.methods.join(", ") || "sans source locale"}; JWT config=${String(fn.verifyJwt)}.`,
      {
        path: fn.path ?? fn.configPath,
        line: fn.path ? 1 : fn.configLine,
        tags: [...fn.methods, ...fn.actions, ...fn.integrations, ...fn.environmentNames],
        details: fn,
      },
    ));
    for (const action of fn.actions) {
      records.push(record(
        "edge-action",
        action,
        `Action statiquement détectée dans la fonction Edge ${fn.name}.`,
        { path: fn.path, tags: [fn.name, fn.endpoint], details: { function: fn.name, action } },
      ));
    }
  }
  for (const route of catalogs.edgeHttpRoutes) {
    records.push(record(
      "edge-http-route",
      `${route.method} ${route.route}`,
      `Sous-route HTTP de la fonction Edge ${route.function}; endpoint complet ${route.endpoint}.`,
      {
        path: route.path,
        line: route.line,
        tags: [route.function, route.method, route.endpoint, ...route.parameters],
        details: route,
      },
    ));
  }
  for (const operation of catalogs.marketingOperations) {
    records.push(record(
      "marketing-operation",
      operation.name,
      `Opération BFF autorisée dans ${operation.group}.`,
      {
        path: operation.path,
        line: operation.line,
        tags: [operation.group, "marketing", "allowlist"],
        details: operation,
      },
    ));
  }
  for (const publicRoute of catalogs.publicRoutes) {
    const recordType = {
      navigable: "static-route",
      platform: "platform-resource",
      data: "static-data",
      media: "public-asset",
      other: "public-resource",
    }[publicRoute.kind] ?? "public-resource";
    records.push(record(
      recordType,
      publicRoute.route,
      `Ressource ${publicRoute.kind} servie depuis le dossier public.`,
      { path: publicRoute.path, tags: ["public", publicRoute.kind], details: publicRoute },
    ));
  }
  for (const authority of catalogs.routingAuthorities) {
    records.push(record(
      "routing-authority",
      authority.value,
      `Autorité de routage ${authority.kind} déclarée dans ${authority.sources.length} source(s).`,
      {
        path: authority.sources[0]?.path,
        line: authority.sources[0]?.line,
        tags: [authority.kind, authority.scheme, authority.name],
        details: authority,
      },
    ));
  }
  for (const route of catalogs.workerRoutes) {
    records.push(record(
      "worker-http-route",
      `${route.method} ${route.route}`,
      `Endpoint du worker ${route.worker}.`,
      {
        path: route.path,
        line: route.line,
        tags: [route.worker, route.method],
        details: route,
      },
    ));
  }
  for (const route of catalogs.seoBuild.routes) {
    records.push(record(
      "seo-build-route",
      route.route,
      `Route SEO ${route.kind} produite pendant le build; indexabilité dépendante des données.`,
      {
        path: route.path,
        line: route.line,
        tags: [route.kind, route.indexability, "prerender"],
        details: route,
      },
    ));
  }
  for (const artifact of catalogs.seoBuild.generatedArtifacts) {
    records.push(record(
      "generated-route-artifact",
      artifact.path,
      artifact.note,
      {
        path: artifact.createdBy,
        tags: [artifact.tracked ? "tracked" : "build-only", "seo"],
        details: artifact,
      },
    ));
  }
  for (const pathLiteral of catalogs.pathLiterals) {
    records.push(record(
      "path-literal",
      pathLiteral.value,
      `Chemin référencé dans ${pathLiteral.sources.length} emplacement(s) de code; à qualifier comme route, lien ou endpoint selon la source.`,
      {
        path: pathLiteral.sources[0]?.path,
        line: pathLiteral.sources[0]?.line,
        tags: pathLiteral.sources.map((source) => source.path),
        details: pathLiteral,
      },
    ));
  }
  for (const parameter of catalogs.queryParameters) {
    records.push(record(
      "query-parameter",
      parameter.name,
      `Paramètre d’URL détecté dans ${parameter.sources.length} emplacement(s).`,
      {
        path: parameter.sources[0]?.path,
        line: parameter.sources[0]?.line,
        tags: parameter.sources.map((source) => source.path),
        details: parameter,
      },
    ));
  }
  for (const migration of catalogs.migrations) {
    records.push(record(
      "migration",
      migration.name,
      `Migration SQL de ${migration.lineCount} lignes, ${migration.objectCount} objets CREATE détectés.`,
      {
        path: migration.path,
        line: 1,
        tags: ["postgresql", "supabase"],
        details: migration,
      },
    ));
  }
  for (const object of catalogs.databaseObjects) {
    const latest = object.sources.at(-1);
    records.push(record(
      "database-object",
      object.name,
      `Objet PostgreSQL de type ${object.type}; ${object.sources.length} définition(s) versionnée(s).`,
      {
        path: latest?.path,
        line: latest?.line,
        tags: [object.type, "postgresql", "supabase"],
        details: object,
      },
    ));
  }
  for (const contract of catalogs.databaseContract) {
    records.push(record(
      "database-contract",
      contract.name,
      `Objet ${contract.kind} exposé dans le contrat TypeScript Supabase versionné.`,
      {
        path: contract.path,
        line: contract.line,
        tags: [contract.kind, "supabase", "typescript-contract"],
        details: contract,
      },
    ));
  }
  for (const job of catalogs.cronJobs) {
    const latest = job.sources.at(-1);
    records.push(record(
      "cron-job",
      job.name,
      `Tâche pg_cron versionnée; planification(s): ${job.schedules.join(", ")}.`,
      {
        path: latest?.path,
        line: latest?.line,
        tags: [...job.schedules, "pg_cron"],
        details: job,
      },
    ));
  }
  for (const bucket of catalogs.storageBuckets) {
    const latest = bucket.sources.at(-1);
    records.push(record(
      "storage-bucket",
      bucket.name,
      "Bucket Supabase Storage déclaré par migration.",
      {
        path: latest?.path,
        line: latest?.line,
        tags: ["storage", "supabase"],
        details: bucket,
      },
    ));
  }
  const runtime = catalogs.runtimeEvidence;
  for (const [environment, observation] of [
    ["production", runtime.production],
    ["demo", runtime.demo],
  ]) {
    records.push(record(
      "runtime-environment",
      `Supabase ${environment}`,
      `${observation.edgeFunctions.active} fonctions Edge actives observées le ${runtime.observedOn}.`,
      {
        path: RUNTIME_EVIDENCE_PATH,
        tags: [
          runtime.observedOn,
          observation.projectRef,
          `${observation.edgeFunctions.active} edge functions`,
          ...observation.edgeFunctions.runtimeOnly,
        ],
        details: observation,
      },
    ));
    for (const functionName of observation.edgeFunctions.runtimeOnly) {
      records.push(record(
        "runtime-edge-drift",
        functionName,
        `Fonction Edge observée uniquement dans le runtime ${environment}, absente du dépôt.`,
        {
          path: RUNTIME_EVIDENCE_PATH,
          tags: [environment, observation.projectRef, "runtime-only"],
          details: { environment, functionName },
        },
      ));
    }
  }
  records.push(record(
    "runtime-schema",
    "Schéma public Supabase production",
    `${runtime.production.publicSchema.tables} tables, ${runtime.production.publicSchema.views} vues, ${runtime.production.publicSchema.rpcNames} noms de RPC et ${runtime.production.publicSchema.enums} enums observés.`,
    {
      path: RUNTIME_EVIDENCE_PATH,
      tags: ["production", runtime.production.projectRef, runtime.observedOn],
      details: runtime.production.publicSchema,
    },
  ));
  records.push(record(
    "runtime-contract-drift",
    "Décalage du contrat TypeScript Supabase",
    `Contrat versionné: ${runtime.committedSupabaseContract.tables} tables et ${runtime.committedSupabaseContract.rpcNames} RPC; production: ${runtime.production.publicSchema.tables} tables et ${runtime.production.publicSchema.rpcNames} RPC.`,
    {
      path: RUNTIME_EVIDENCE_PATH,
      tags: ["supabase", "typescript", "drift", runtime.committedSupabaseContract.path],
      details: runtime.committedSupabaseContract,
    },
  ));
  for (const item of catalogs.deployment.redirects) {
    records.push(record(
      "redirect",
      item.source,
      `Redirige${item.host ? ` sur ${item.host}` : ""} vers ${item.destination}.`,
      {
        path: item.path,
        tags: [item.host, item.destination, String(item.statusCode ?? item.permanent ?? "temporary")],
        details: item,
      },
    ));
  }
  for (const item of catalogs.deployment.rewrites) {
    records.push(record(
      "rewrite",
      item.source,
      `Réécriture${item.host ? ` sur ${item.host}` : ""} vers ${item.destination}.`,
      { path: item.path, tags: [item.host, item.destination], details: item },
    ));
  }
  for (const item of catalogs.deployment.headers) {
    records.push(record(
      "http-headers",
      item.source,
      `En-têtes ${item.keys.join(", ")}${item.host ? ` pour ${item.host}` : ""}.`,
      { path: item.path, tags: [item.host, ...item.keys], details: item },
    ));
  }
  records.push(record(
    "middleware",
    catalogs.deployment.middleware.matcher ?? "middleware",
    "Redirection canonique des anciennes URL de restaurants.",
    {
      path: catalogs.deployment.middleware.path,
      tags: ["seo", "redirect"],
      details: catalogs.deployment.middleware,
    },
  ));
  for (const script of catalogs.package.scripts) {
    records.push(record(
      "package-script",
      script.name,
      script.command,
      { path: script.path, tags: ["pnpm", "automation"], details: script },
    ));
  }
  for (const dependency of catalogs.package.dependencies) {
    records.push(record(
      "dependency",
      dependency.name,
      `${dependency.kind} ${dependency.version}.`,
      {
        path: dependency.path,
        tags: [dependency.kind, dependency.version],
        details: dependency,
      },
    ));
  }
  for (const workflow of catalogs.workflows) {
    records.push(record(
      "workflow",
      workflow.name,
      `Workflow GitHub Actions; jobs: ${workflow.jobs.join(", ") || "définition dynamique"}.`,
      { path: workflow.path, tags: workflow.jobs, details: workflow },
    ));
  }
  for (const document of catalogs.documents) {
    records.push(record(
      "document",
      document.title,
      `Document Markdown avec ${document.headings.length} section(s).`,
      {
        path: document.path,
        line: document.headings[0]?.line ?? 1,
        tags: document.headings.map((heading) => heading.title),
        details: document,
      },
    ));
    for (const heading of document.headings) {
      records.push(record(
        "document-section",
        heading.title,
        `Section de ${document.title}.`,
        {
          path: document.path,
          line: heading.line,
          tags: [document.title, `h${heading.level}`],
          details: heading,
        },
      ));
    }
  }
  for (const module of catalogs.modules) {
    records.push(record(
      "code-module",
      module.path,
      `Module de ${module.lineCount} lignes; exports: ${module.exports.map((item) => item.name).join(", ") || "aucun export statique"}.`,
      {
        path: module.path,
        line: 1,
        tags: [...module.integrations, ...module.environmentNames, ...module.exports.map((item) => item.name)],
        details: module,
      },
    ));
    for (const exported of module.exports) {
      records.push(record(
        "exported-symbol",
        exported.name,
        `Export ${exported.kind} de ${module.path}.`,
        {
          path: module.path,
          line: exported.line,
          tags: [exported.kind, ...module.integrations],
          details: exported,
        },
      ));
    }
  }
  const environmentUsage = new Map();
  for (const module of catalogs.modules) {
    for (const name of module.environmentNames) {
      const paths = environmentUsage.get(name) ?? [];
      paths.push(module.path);
      environmentUsage.set(name, paths);
    }
  }
  for (const [name, paths] of [...environmentUsage.entries()].sort(([a], [b]) => compareText(a, b))) {
    records.push(record(
      "environment-variable",
      name,
      `Nom de variable d’environnement référencé dans ${paths.length} module(s); aucune valeur n’est indexée.`,
      { path: paths[0], tags: paths, details: { name, paths } },
    ));
  }
  for (const integration of catalogs.integrations) {
    records.push(record(
      "integration",
      humanize(integration.name),
      `Intégration externe détectée dans ${integration.paths.length} module(s).`,
      {
        path: integration.paths[0],
        tags: [integration.name, ...integration.paths],
        details: integration,
      },
    ));
  }
  for (const file of catalogs.files) {
    records.push(record(
      "file",
      file.path,
      `Fichier du dépôt classé ${file.category}.`,
      {
        path: file.path,
        tags: [file.category, file.extension],
        details: file,
      },
    ));
  }
  const sorted = records.sort((a, b) => compareText(
    `${a.type}:${a.title}:${a.path ?? ""}:${a.line ?? 0}`,
    `${b.type}:${b.title}:${b.path ?? ""}:${b.line ?? 0}`,
  ));
  const occurrences = new Map();
  return sorted.map((item) => {
    const count = occurrences.get(item.id) ?? 0;
    occurrences.set(item.id, count + 1);
    return count === 0 ? item : { ...item, id: `${item.id}:${count + 1}` };
  });
}

export function buildApplicationIndex(root = REPOSITORY_ROOT) {
  const digestSources = new Map();
  const repositoryFiles = listRepositoryFiles(root);
  const frontendRoutes = parseFrontendRoutes(root, digestSources);
  const featureFlags = parseFeatureFlags(root, digestSources);
  const rawModules = parseCodeModules(root, repositoryFiles, digestSources);
  const apiRoutes = parseApiRoutes(root, repositoryFiles, digestSources);
  const edgeFunctions = parseEdgeFunctions(root, repositoryFiles, digestSources);
  const edgeHttpRoutes = parseEdgeHttpRoutes(root, edgeFunctions, digestSources);
  const { authorities: routingAuthorities, shortcuts: pwaShortcuts } = parseRoutingAuthorities(
    root,
    repositoryFiles,
    digestSources,
  );
  const workerRoutes = parseWorkerRoutes(root, repositoryFiles, digestSources);
  const seoBuild = parseSeoBuildRoutes(root, repositoryFiles, digestSources);
  const { modules, pathLiterals, queryParameters } = aggregateModulePaths(
    rawModules,
    frontendRoutes,
    edgeHttpRoutes,
    pwaShortcuts,
  );
  const pages = parsePages(repositoryFiles, modules, frontendRoutes);
  const { migrations, databaseObjects, cronJobs, storageBuckets } = parseMigrations(
    root,
    repositoryFiles,
    digestSources,
  );
  const deployment = parseDeploymentRules(root, digestSources);
  const packageCatalog = parsePackage(root, digestSources);
  const workflows = parseWorkflows(root, repositoryFiles, digestSources);
  const documents = parseDocuments(root, repositoryFiles, digestSources);
  const files = parseFiles(repositoryFiles);
  const marketingOperations = parseMarketingOperations(root, digestSources);
  const publicRoutes = parsePublicRoutes(repositoryFiles);
  const databaseContract = parseDatabaseContract(root, digestSources);
  const runtimeEvidence = parseRuntimeEvidence(root, digestSources);
  const integrations = INTEGRATIONS
    .map((name) => ({
      name,
      paths: modules.filter((module) => module.integrations.includes(name)).map((module) => module.path),
    }))
    .filter((integration) => integration.paths.length > 0);
  const catalogs = {
    frontendRoutes,
    pages,
    featureFlags,
    apiRoutes,
    edgeFunctions,
    edgeHttpRoutes,
    routingAuthorities,
    workerRoutes,
    seoBuild,
    marketingOperations,
    publicRoutes,
    pathLiterals,
    queryParameters,
    integrations,
    migrations,
    databaseObjects,
    databaseContract,
    runtimeEvidence,
    cronJobs,
    storageBuckets,
    deployment,
    package: packageCatalog,
    workflows,
    documents,
    modules,
    files,
  };
  const records = buildRecords(catalogs);
  const counts = Object.fromEntries(Object.entries({
    records: records.length,
    frontendRoutes: frontendRoutes.length,
    pages: pages.length,
    featureFlags: featureFlags.length,
    apiRoutes: apiRoutes.length,
    edgeFunctions: edgeFunctions.length,
    edgeHttpRoutes: edgeHttpRoutes.length,
    routingAuthorities: routingAuthorities.length,
    workerRoutes: workerRoutes.length,
    seoBuildRoutes: seoBuild.routes.length,
    marketingOperations: marketingOperations.length,
    publicEntries: publicRoutes.length,
    publicNavigableRoutes: publicRoutes.filter((item) => item.kind === "navigable").length,
    publicAssets: publicRoutes.filter((item) => item.kind === "media").length,
    pathLiterals: pathLiterals.length,
    queryParameters: queryParameters.length,
    integrations: integrations.length,
    migrations: migrations.length,
    databaseObjects: databaseObjects.length,
    databaseContract: databaseContract.length,
    runtimeOnlyEdgeFunctions: [
      ...runtimeEvidence.production.edgeFunctions.runtimeOnly,
      ...runtimeEvidence.demo.edgeFunctions.runtimeOnly,
    ].length,
    cronJobs: cronJobs.length,
    storageBuckets: storageBuckets.length,
    modules: modules.length,
    exportedSymbols: modules.reduce((total, module) => total + module.exports.length, 0),
    workflows: workflows.length,
    documents: documents.length,
    repositoryFiles: files.length,
  }).sort(([a], [b]) => compareText(a, b)));
  return {
    schemaVersion: 2,
    repository: "Mtnrconcept1/cloud-rebuild",
    generatedBy: "scripts/generate-application-index.mjs",
    sourceDigest: digestSourceMap(digestSources, repositoryFiles),
    scope: "État versionné local du dépôt; inventaire statique sans lecture des valeurs de secrets ni interrogation de la production.",
    counts,
    catalogs,
    records,
  };
}

export const serializeIndex = (index) => `${JSON.stringify(index, null, 1)}\n`;

function markdownCell(value) {
  if (value === null || value === undefined || value === "") return "—";
  return compact(value)
    .replaceAll("|", "\\|")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function sourceLink(file, line = null) {
  if (!file) return "—";
  const href = `../../${file.split("/").map(encodeURIComponent).join("/")}${line ? `#L${line}` : ""}`;
  return `[${markdownCell(file)}${line ? `:${line}` : ""}](${href})`;
}

function table(headers, rows) {
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(markdownCell).join(" | ")} |`),
  ].join("\n");
}

function groupCount(values, getKey) {
  const counts = new Map();
  for (const value of values) {
    const key = getKey(value);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].sort(([a], [b]) => compareText(a, b));
}

function groupedDatabaseObjectLines(objects) {
  const lines = [];
  for (const [type, count] of groupCount(objects, (object) => object.type)) {
    lines.push(`<details><summary>${type} (${count})</summary>`, "");
    for (const object of objects.filter((item) => item.type === type)) {
      lines.push(`- \`${markdownCell(object.name)}\` (${object.sources.length} définition(s))`);
    }
    lines.push("", "</details>", "");
  }
  return lines;
}

export function renderApplicationReference(index) {
  const { catalogs, counts } = index;
  const lines = [
    "# Référence exhaustive et index de recherche de l’application TOK",
    "",
    "> Document généré depuis les sources du dépôt. Ne pas modifier manuellement : exécuter `pnpm docs:application-index`.",
    "",
    "## Utiliser l’index",
    "",
    "- Recherche libre : `pnpm docs:search -- marketing campagne`",
    "- Filtrer un type : `pnpm docs:search -- --type=frontend-route admin`",
    "- Filtrer une surface : `pnpm docs:search -- --surface=restaurant factures`",
    "- Sortie exploitable : `pnpm docs:search -- --json --limit=50 supabase`",
    `- Index machine : [${INDEX_JSON_PATH.split("/").at(-1)}](./${INDEX_JSON_PATH.split("/").at(-1)})`,
    "- Vérification anti-obsolescence : `pnpm docs:application-index:check`",
    "",
    "## Périmètre et preuve de fraîcheur",
    "",
    `- Dépôt : \`${index.repository}\``,
    `- Version du schéma : \`${index.schemaVersion}\``,
    `- Empreinte SHA-256 des sources indexées : \`${index.sourceDigest}\``,
    `- Périmètre : ${index.scope}`,
    "- Les noms de variables d’environnement sont indexés, jamais leurs valeurs.",
    "- Les comportements dépendant des données, fournisseurs et secrets de production exigent une vérification d’exécution séparée.",
    "- État Supabase observé : [photographie distante du 3 octobre 2026](./TOK_RUNTIME_EVIDENCE_2026-10-03.md).",
    "",
    "### Volumétrie",
    "",
    table(["Famille", "Total"], Object.entries(counts).map(([key, value]) => [key, String(value)])),
    "",
    "## État distant observé",
    "",
    `Photographie Supabase en lecture seule du \`${catalogs.runtimeEvidence.observedOn}\`. Source structurée : [${RUNTIME_EVIDENCE_PATH.split("/").at(-1)}](./${RUNTIME_EVIDENCE_PATH.split("/").at(-1)}).`,
    "",
    table(
      ["Environnement", "Projet", "Fonctions Git", "Fonctions actives", "Runtime uniquement"],
      [
        ["production", catalogs.runtimeEvidence.production],
        ["demo", catalogs.runtimeEvidence.demo],
      ].map(([name, observation]) => [
        name,
        observation.projectRef,
        String(observation.edgeFunctions.repository),
        String(observation.edgeFunctions.active),
        observation.edgeFunctions.runtimeOnly.join(", "),
      ]),
    ),
    "",
    table(
      ["Contrat de données", "Tables", "Vues", "RPC", "Enums"],
      [
        ["Production observée", catalogs.runtimeEvidence.production.publicSchema],
        ["Types committés", catalogs.runtimeEvidence.committedSupabaseContract],
      ].map(([name, observation]) => [
        name,
        String(observation.tables),
        String(observation.views),
        String(observation.rpcNames),
        String(observation.enums),
      ]),
    ),
    "",
    `Migrations locales/distantes alignées : **${catalogs.runtimeEvidence.production.migrationsAligned}**.`,
    "",
    "## Architecture fonctionnelle",
    "",
    "```text",
    "Navigateur / applications Capacitor",
    "  ├─ React Router : surfaces publique, client, restaurateur, coursier, commercial, admin, marketing",
    "  ├─ Liens applicatifs : schéma tok://, universal/app links iOS/Android et raccourcis PWA",
    "  ├─ /api/marketing/* : BFF Vercel isolé de la surface marketing",
    "  └─ /functions/v1/* : fonctions Edge Supabase",
    "       ├─ Authentification, règles métier et intégrations externes",
    "       └─ PostgreSQL / RLS / stockage, versionnés par les migrations",
    "Vercel : redirections d’hôtes, réécritures, sécurité HTTP, SPA et middleware SEO",
    "Worker image IA : endpoints de santé /healthz et /readyz",
    "GitHub Actions : contrôles, synchronisation, déploiement et opérations planifiées",
    "```",
    "",
    "### Surfaces applicatives",
    "",
    table(
      ["Surface", "Routes"],
      groupCount(catalogs.frontendRoutes, (route) => route.surface)
        .map(([surface, count]) => [surface, String(count)]),
    ),
    "",
    "### Groupes de fonctionnalités",
    "",
    table(
      ["Groupe", "Flags"],
      groupCount(catalogs.featureFlags, (flag) => flag.group)
        .map(([group, count]) => [group, String(count)]),
    ),
    "",
    "## Routes frontend complètes",
    "",
    table(
      ["Route", "Surface", "Composants", "Protection", "Flag", "Redirection", "Source"],
      catalogs.frontendRoutes.map((route) => [
        `\`${route.path}\``,
        route.surface,
        route.components.join(", "),
        [...route.guards, ...route.requiredRoles].join(", "),
        route.featureGate,
        route.redirectTo,
        sourceLink(route.source, route.line),
      ]),
    ),
    "",
    "## Routage Vercel, domaines et middleware",
    "",
    "### Redirections",
    "",
    table(
      ["Source", "Hôte", "Destination", "Statut"],
      catalogs.deployment.redirects.map((item) => [
        item.source,
        item.host,
        item.destination,
        item.statusCode ?? (item.permanent ? "permanent" : "temporaire"),
      ]),
    ),
    "",
    "### Réécritures",
    "",
    table(
      ["Source", "Hôte", "Destination"],
      catalogs.deployment.rewrites.map((item) => [item.source, item.host, item.destination]),
    ),
    "",
    "### Règles d’en-têtes",
    "",
    table(
      ["Source", "Hôte", "En-têtes"],
      catalogs.deployment.headers.map((item) => [item.source, item.host, item.keys.join(", ")]),
    ),
    "",
    `Middleware : matcher \`${catalogs.deployment.middleware.matcher ?? "non détecté"}\` dans ${sourceLink(catalogs.deployment.middleware.path)}.`,
    "",
    "### Autorités de routage applicatives, mobiles et PWA",
    "",
    table(
      ["Type", "Valeur", "Nom", "Sources", "Première source"],
      catalogs.routingAuthorities.map((item) => [
        item.kind,
        `\`${item.value}\``,
        item.name,
        String(item.sources.length),
        sourceLink(item.sources[0]?.path, item.sources[0]?.line),
      ]),
    ),
    "",
    "## API Vercel",
    "",
    table(
      ["Route", "Méthodes", "Handler", "Intégrations", "Source"],
      catalogs.apiRoutes.map((route) => [
        route.route,
        route.methods.join(", "),
        route.handler,
        route.integrations.join(", "),
        sourceLink(route.path),
      ]),
    ),
    "",
    "## Opérations du BFF marketing",
    "",
    table(
      ["Opération", "Groupe", "Source"],
      catalogs.marketingOperations.map((operation) => [
        operation.name,
        operation.group,
        sourceLink(operation.path, operation.line),
      ]),
    ),
    "",
    "## Fonctions Edge Supabase",
    "",
    table(
      ["Fonction", "Source", "Config déclarée", "JWT config", "Méthodes", "Actions qualifiées", "Intégrations"],
      catalogs.edgeFunctions.map((fn) => [
        fn.name,
        fn.sourcePresent ? sourceLink(fn.path, 1) : "absente",
        fn.configured ? `oui (${sourceLink(fn.configPath, fn.configLine)})` : "non",
        String(fn.verifyJwt),
        fn.methods.join(", "),
        fn.actions.join(", "),
        fn.integrations.join(", "),
      ]),
    ),
    "",
    "### Sous-routes HTTP des fonctions Edge",
    "",
    table(
      ["Fonction", "Méthode", "Route", "Endpoint complet", "Paramètres", "Source"],
      catalogs.edgeHttpRoutes.map((route) => [
        route.function,
        route.method,
        route.route,
        route.endpoint,
        route.parameters.join(", "),
        sourceLink(route.path, route.line),
      ]),
    ),
    "",
    "### Endpoints des workers",
    "",
    table(
      ["Worker", "Méthode statique", "Route", "Source"],
      catalogs.workerRoutes.map((route) => [
        route.worker,
        route.method,
        route.route,
        sourceLink(route.path, route.line),
      ]),
    ),
    "",
    "## Routes statiques et chemins référencés",
    "",
    "Les ressources publiques correspondent exactement aux fichiers du dossier `public/`; leur type distingue les pages navigables des manifests, données et médias. Les chemins référencés sont des littéraux trouvés dans le code : ils peuvent être des routes internes, des endpoints, des retours OAuth, des deep links ou des destinations externes.",
    "",
    "### Ressources publiques",
    "",
    table(
      ["Chemin servi", "Type", "Source"],
      catalogs.publicRoutes.map((item) => [item.route, item.kind, sourceLink(item.path)]),
    ),
    "",
    "### Chemins référencés dans le code",
    "",
    table(
      ["Chemin", "Occurrences", "Première source"],
      catalogs.pathLiterals.map((item) => [
        item.value,
        String(item.sources.length),
        sourceLink(item.sources[0]?.path, item.sources[0]?.line),
      ]),
    ),
    "",
    "### Paramètres d’URL",
    "",
    table(
      ["Paramètre", "Routes associées", "Occurrences", "Première source"],
      catalogs.queryParameters.map((item) => [
        item.name,
        item.routes.join(", "),
        String(item.sources.length),
        sourceLink(item.sources[0]?.path, item.sources[0]?.line),
      ]),
    ),
    "",
    "## Routes SEO générées au build",
    "",
    "Ces contrats décrivent les familles statiquement détectables. Le nombre exact de fichiers HTML, leur état index/noindex et les aliases Stoppin dépendent des données disponibles pendant `build:prod`; ils ne sont donc pas présentés comme une preuve de production.",
    "",
    table(
      ["Route ou famille", "Type", "Indexabilité", "Source"],
      catalogs.seoBuild.routes.map((route) => [
        route.route,
        route.kind,
        route.indexability,
        sourceLink(route.path, route.line),
      ]),
    ),
    "",
    "### Artefacts de routage générés",
    "",
    table(
      ["Artefact", "Versionné", "Générateur", "Limite de preuve"],
      catalogs.seoBuild.generatedArtifacts.map((artifact) => [
        artifact.path,
        artifact.tracked ? "oui" : "non",
        sourceLink(artifact.createdBy),
        artifact.note,
      ]),
    ),
    "",
    "## Flags fonctionnels",
    "",
    table(
      ["Nom", "Libellé", "Groupe", "Défaut", "Routes", "Dépendances", "Description", "Source"],
      catalogs.featureFlags.map((flag) => [
        flag.name,
        flag.label,
        flag.group,
        String(flag.defaultEnabled),
        (flag.routeTargets ?? []).join(", "),
        [...(flag.dependsOn ?? []), ...(flag.requiresAnyOf ?? [])].join(", "),
        flag.description,
        sourceLink(flag.source, flag.line),
      ]),
    ),
    "",
    "## Pages frontend",
    "",
    table(
      ["Page", "Routes", "Montée", "Exports", "Source"],
      catalogs.pages.map((page) => [
        page.name,
        page.routes.join(", "),
        page.mounted ? "oui" : "non",
        page.exports.map((item) => item.name).join(", "),
        sourceLink(page.path),
      ]),
    ),
    "",
    "## PostgreSQL et migrations",
    "",
    "### Objets SQL détectés",
    "",
    ...groupedDatabaseObjectLines(catalogs.databaseObjects),
    "### Contrat TypeScript Supabase versionné",
    "",
    "Ce contrat décrit ce que le frontend peut typer localement. Il ne remplace pas une introspection de la base distante et peut révéler un décalage de génération.",
    "",
    table(
      ["Type", "Nom", "Source"],
      catalogs.databaseContract.map((item) => [item.kind, item.name, sourceLink(item.path, item.line)]),
    ),
    "",
    "### Tâches pg_cron détectées",
    "",
    table(
      ["Tâche", "Planifications versionnées", "Dernière source"],
      catalogs.cronJobs.map((job) => [
        job.name,
        job.schedules.join(", "),
        sourceLink(job.sources.at(-1)?.path, job.sources.at(-1)?.line),
      ]),
    ),
    "",
    "### Buckets Storage détectés",
    "",
    table(
      ["Bucket", "Dernière source"],
      catalogs.storageBuckets.map((bucket) => [
        bucket.name,
        sourceLink(bucket.sources.at(-1)?.path, bucket.sources.at(-1)?.line),
      ]),
    ),
    "",
    "### Historique complet des migrations",
    "",
    table(
      ["Migration", "Lignes", "Objets CREATE", "Source"],
      catalogs.migrations.map((migration) => [
        migration.name,
        String(migration.lineCount),
        String(migration.objectCount),
        sourceLink(migration.path, 1),
      ]),
    ),
    "",
    "## Automatisation, dépendances et CI",
    "",
    `Gestionnaire : \`${catalogs.package.packageManager ?? "non déclaré"}\`; moteurs : \`${JSON.stringify(catalogs.package.engines)}\`.`,
    "",
    "### Commandes package",
    "",
    table(
      ["Commande", "Exécution"],
      catalogs.package.scripts.map((script) => [`pnpm ${script.name}`, `\`${script.command}\``]),
    ),
    "",
    "### Workflows GitHub Actions",
    "",
    table(
      ["Workflow", "Jobs", "Source"],
      catalogs.workflows.map((workflow) => [workflow.name, workflow.jobs.join(", "), sourceLink(workflow.path)]),
    ),
    "",
    "### Dépendances",
    "",
    table(
      ["Paquet", "Type", "Version"],
      catalogs.package.dependencies.map((dependency) => [dependency.name, dependency.kind, dependency.version]),
    ),
    "",
    "### Intégrations détectées",
    "",
    table(
      ["Intégration", "Modules", "Première source"],
      catalogs.integrations.map((integration) => [
        humanize(integration.name),
        String(integration.paths.length),
        sourceLink(integration.paths[0], 1),
      ]),
    ),
    "",
    "## Modules et symboles exportés",
    "",
    "Chaque module de code et chaque symbole exporté sont indexés individuellement dans le JSON de recherche. L’inventaire de fichiers ci-dessous fournit la liste complète; ce résumé évite de dupliquer plusieurs milliers de lignes dans la version Markdown.",
    "",
    table(
      ["Famille de module", "Total"],
      groupCount(catalogs.modules, (module) => classifyFile(module.path))
        .map(([category, count]) => [category, String(count)]),
    ),
    "",
    "## Documentation existante",
    "",
    table(
      ["Document", "Sections", "Source"],
      catalogs.documents.map((document) => [
        document.title,
        String(document.headings.length),
        sourceLink(document.path, 1),
      ]),
    ),
    "",
    "## Inventaire exhaustif des fichiers versionnés",
    "",
    "Cet inventaire assure qu’aucun composant du dépôt n’est invisible dans l’index. Les contenus binaires ne sont pas analysés, mais leur chemin et leur catégorie sont recherchables.",
    "",
  ];
  for (const [category, count] of groupCount(catalogs.files, (file) => file.category)) {
    lines.push(
      `<details><summary>${category} (${count})</summary>`,
      "",
      ...catalogs.files
        .filter((file) => file.category === category)
        .map((file) => `- \`${markdownCell(file.path)}\``),
      "",
      "</details>",
      "",
    );
  }
  lines.push(
    "## Limites de l’inventaire statique",
    "",
    "- `ANY` signifie que la méthode HTTP n’est pas déclarée de façon statiquement détectable dans le point d’entrée.",
    "- `verify_jwt = false` dans Supabase ne signifie pas absence de contrôle : les fonctions peuvent valider elles-mêmes sessions, rôles, signatures ou secrets.",
    "- Les objets SQL listés proviennent des instructions `CREATE` versionnées; les suppressions et l’état distant final doivent être contrôlés dans la base cible.",
    "- Les pages non montées peuvent être des brouillons, des composants historiques ou des points d’entrée utilisés indirectement.",
    "- L’index ne révèle aucune valeur d’environnement et ne prouve pas la disponibilité des services externes.",
    "",
  );
  return `${lines.join("\n").replace(/\n+$/, "")}\n`;
}

function searchableText(item) {
  return [
    item.type,
    item.title,
    item.description,
    item.path,
    item.surface,
    ...(item.tags ?? []),
  ].join(" ").toLowerCase();
}

export function hydrateApplicationSearchResults(index, results) {
  const detailsByRef = new Map();
  const visited = new Set();
  const visit = (value, isCatalogRoot = false) => {
    if (!value || typeof value !== "object" || visited.has(value)) return;
    visited.add(value);
    if (!isCatalogRoot && !Array.isArray(value)) {
      detailsByRef.set(shortHash(JSON.stringify(value)), value);
    }
    for (const nested of Array.isArray(value) ? value : Object.values(value)) visit(nested);
  };
  visit(index.catalogs, true);
  return results.map((item) => ({
    ...item,
    details: item.detailRef ? detailsByRef.get(item.detailRef) ?? null : null,
  }));
}

export function searchApplicationIndex(records, query, options = {}) {
  const terms = compact(query).toLowerCase().split(" ").filter(Boolean);
  const type = options.type?.toLowerCase() ?? null;
  const surface = options.surface?.toLowerCase() ?? null;
  const limit = Number.isFinite(options.limit) ? Math.max(1, options.limit) : 20;
  return records
    .filter((item) => !type || item.type.toLowerCase() === type)
    .filter((item) => !surface || item.surface?.toLowerCase() === surface)
    .map((item) => {
      const haystack = searchableText(item);
      const title = item.title.toLowerCase();
      const itemPath = item.path?.toLowerCase() ?? "";
      let score = terms.length ? 0 : 1;
      for (const term of terms) {
        if (!haystack.includes(term)) return { item, score: -1 };
        score += title === term ? 100 : title.includes(term) ? 45 : itemPath.includes(term) ? 25 : 10;
      }
      return { item, score };
    })
    .filter((result) => result.score >= 0)
    .sort((a, b) => b.score - a.score || compareText(a.item.title, b.item.title))
    .slice(0, limit)
    .map(({ item, score }) => ({ ...item, score }));
}
