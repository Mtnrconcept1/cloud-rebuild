// Run against installed dependencies, not mocked copies.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
const require = createRequire(import.meta.url);
const root = new URL('../', import.meta.url);
const fromTailwind = createRequire(require.resolve('tailwindcss'));
const fromChokidar = createRequire(fromTailwind.resolve('chokidar'));
const braces = fromChokidar('braces');
const nested = (open, close, depth) => open.repeat(depth) + 'x' + close.repeat(depth);

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
