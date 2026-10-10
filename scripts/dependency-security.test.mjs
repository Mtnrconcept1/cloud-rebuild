// Run against installed dependencies, not mocked copies.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
const require = createRequire(import.meta.url);
const root = new URL('../', import.meta.url);
const capacitorPackages = ['core', 'cli', 'android', 'ios'];
const capacitorVersions = Object.fromEntries(capacitorPackages.map((name) => [
  name,
  JSON.parse(readFileSync(new URL(`node_modules/@capacitor/${name}/package.json`, root), 'utf8')).version,
]));
const fromTailwind = createRequire(require.resolve('tailwindcss'));
const fromChokidar = createRequire(fromTailwind.resolve('chokidar'));
const braces = fromChokidar('braces');
const fromJsdom = createRequire(require.resolve('jsdom'));
const fromCssTree = createRequire(fromJsdom.resolve('css-tree'));
const fromPostcss = createRequire(require.resolve('postcss'));
const nested = (open, close, depth) => open.repeat(depth) + 'x' + close.repeat(depth);

test('jsdom CSS Tree and PostCSS resolve the corrected source-map-js package', () => {
  for (const dependencyRequire of [fromCssTree, fromPostcss]) {
    assert.equal(dependencyRequire('source-map-js/package.json').version, '1.2.2');
  }
});

test('CSS Tree and PostCSS still generate consumable source maps', () => {
  const cssTree = fromJsdom('css-tree');
  const postcss = require('postcss');
  const { SourceMapConsumer } = fromCssTree('source-map-js');
  const css = 'a { color: red; }';
  const generated = cssTree.generate(cssTree.parse(css, {
    positions: true, filename: 'input.css',
  }), { sourceMap: true });
  assert.equal(generated.css, 'a{color:red}');
  const cssTreeMap = new SourceMapConsumer(generated.map.toJSON());
  assert.equal(cssTreeMap.originalPositionFor({ line: 1, column: 0 }).source, 'input.css');

  const result = postcss().process(css, {
    from: 'input.css', to: 'output.css', map: { inline: false, annotation: false },
  });
  assert.equal(result.css, css);
  const postcssMap = new SourceMapConsumer(result.map.toJSON());
  assert.equal(postcssMap.originalPositionFor({ line: 1, column: 0 }).source, 'input.css');
});

test('indexed source maps reject huge offsets and avoid amplification within a bounded process', () => {
  // Keep hostile maps out of the test runner: a dependency regression must fail,
  // not freeze CI or exhaust its heap (GHSA-68fv-2mgg-jv7q).
  execFileSync(process.execPath, ['--max-old-space-size=128', '-e', `
    const assert = require('node:assert/strict');
    const { SourceMapConsumer, SourceNode } = require(process.argv[1]);
    const basic = { version: 3, sources: ['input.css'], sourcesContent: ['a'], names: [], mappings: 'AAAA' };
    const indexed = (line, map = basic) => ({
      version: 3, sections: [{ offset: { line, column: 0 }, map }],
    });
    assert.throws(() => new SourceMapConsumer(indexed(1e9)), /must not exceed/);
    assert.throws(() => new SourceMapConsumer(indexed(7e6, indexed(7e6))), /nested sections/);
    const distant = new SourceMapConsumer(indexed(1e7));
    assert.equal(SourceNode.fromStringWithSourceMap('a', distant).toString(), 'a');
    let nestedMap = basic;
    for (let depth = 0; depth < 30; depth++) nestedMap = indexed(0, nestedMap);
    assert.deepEqual(new SourceMapConsumer(nestedMap).sources, ['input.css']);
  `, fromCssTree.resolve('source-map-js')], {
    encoding: 'utf8', timeout: 5_000, maxBuffer: 64 * 1024, windowsHide: true,
  });
});

test('native Capacitor packages stay aligned outside the critical advisory ranges', () => {
  for (const name of capacitorPackages) {
    const version = capacitorVersions[name];
    assert.equal(version, capacitorVersions.core, name);
    assert.match(version, /^8\.\d+\.\d+$/);
    const [, minor, patch] = version.split('.').map(Number);
    // GHSA-rvm3-566m-v7fv: 8.5.0 is vulnerable too; fixes are 8.4.3 and 8.5.1.
    assert.ok(minor > 5 || (minor === 5 && patch >= 1) || (minor === 4 && patch >= 3), name);
  }
});

test('iOS uses the corrected runtime and portable existing plugin paths', () => {
  const swift = readFileSync(new URL('ios/App/CapApp-SPM/Package.swift', root), 'utf8');
  assert.equal(swift.match(/capacitor-swift-pm\.git", exact: "([^"]+)"/)?.[1], capacitorVersions.ios);
  for (const dependency of swift.matchAll(/\.package\(name: "[^"]+", path: "([^"]+)"\)/g)) {
    assert.ok(!dependency[1].includes('\\'), 'Swift paths must also work on macOS');
    assert.ok(existsSync(path.resolve(fileURLToPath(new URL('ios/App/CapApp-SPM/', root)), dependency[1])), dependency[1]);
  }
});

test('Android uses the installed corrected runtime and existing plugin paths', () => {
  const gradle = readFileSync(new URL('android/capacitor.settings.gradle', root), 'utf8');
  const runtime = gradle.match(/project\(':capacitor-android'\)\.projectDir = new File\('([^']+)'\)/);
  assert.ok(runtime);
  const androidRoot = fileURLToPath(new URL('android/', root));
  assert.equal(realpathSync(path.resolve(androidRoot, runtime[1])), realpathSync(new URL('node_modules/@capacitor/android/capacitor', root)));
  for (const dependency of gradle.matchAll(/projectDir = new File\('([^']+)'\)/g)) {
    assert.ok(existsSync(path.resolve(androidRoot, dependency[1])), dependency[1]);
  }
});

test('Deno workspace declarations match the corrected Capacitor dependencies', () => {
  const manifest = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
  const deno = JSON.parse(readFileSync(new URL('deno.lock', root), 'utf8'));
  for (const name of capacitorPackages) {
    const specifier = manifest.dependencies[`@capacitor/${name}`] ?? manifest.devDependencies[`@capacitor/${name}`];
    assert.ok(deno.workspace.packageJson.dependencies.includes(`npm:@capacitor/${name}@${specifier}`), name);
  }
});

test('normal glob expansion and bounded nesting remain compatible', () => {
  assert.deepEqual(braces.expand('src/{pages,lib}/*.{ts,tsx}'), [
    'src/pages/*.ts', 'src/pages/*.tsx', 'src/lib/*.ts', 'src/lib/*.tsx',
  ]);
  assert.deepEqual(braces.expand('{1..3}'), ['1', '2', '3']);
  assert.doesNotThrow(() => braces(nested('{', '}', 128)));
  assert.doesNotThrow(() => braces(nested('(', ')', 128)));
});

for (const [label, pattern] of [
  ['braces', nested('{', '}', 129)],
  ['parentheses', nested('(', ')', 129)],
  ['mixed nodes', '{('.repeat(65) + 'x' + ')}'.repeat(65)],
  ['unclosed nodes', '{'.repeat(129) + 'x'],
]) {
  test(`rejects excessive ${label} before recursive processing`, () => {
    for (const operation of [braces, braces.parse, braces.compile, braces.expand]) {
      assert.throws(() => operation(pattern), {
        name: 'SyntaxError', message: 'Pattern nesting exceeds the safety limit of 128',
      });
    }
  });
}

test('escaped and quoted delimiters are not mistaken for nested AST nodes', () => {
  assert.doesNotThrow(() => braces('\\{'.repeat(200)));
  assert.doesNotThrow(() => braces('"' + '{'.repeat(200) + '"'));
  assert.doesNotThrow(() => braces('[' + '{'.repeat(200) + ']'));
});

test('the vulnerable ZIP extractor is absent from the canonical dependency graph', () => {
  const lock = readFileSync(new URL('pnpm-lock.yaml', root), 'utf8');
  assert.doesNotMatch(lock, /^\s+extract-zip@/m);
  assert.equal(existsSync(new URL('package-lock.json', root)), false,
    'The unused root npm lock must not compete with the canonical pnpm graph');
});

test('security upgrades preserve React and Vite majors and require supported Node', () => {
  const manifest = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
  assert.equal(manifest.dependencies['react-router-dom'], '^7.18.4');
  assert.equal(manifest.devDependencies.vitest, '^4.1.11');
  assert.equal(manifest.devDependencies.puppeteer, '^25.12.0');
  assert.equal(manifest.engines.node, '>=22.12.0');
  assert.match(manifest.dependencies.react, /^\^18\./);
  assert.match(manifest.devDependencies.vite, /^\^6\./);
  const deno = JSON.parse(readFileSync(new URL('deno.lock', root), 'utf8'));
  for (const specifier of ['npm:puppeteer@^25.12.0', 'npm:react-router-dom@^7.18.4', 'npm:vitest@^4.1.11']) {
    assert.ok(deno.workspace.packageJson.dependencies.includes(specifier));
  }
});
