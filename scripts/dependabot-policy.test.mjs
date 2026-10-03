// Run with: node --test scripts/dependabot-policy.test.mjs
// The Dependabot file intentionally uses JSON, a YAML-compatible representation,
// so these policy checks need neither an install nor a third-party YAML parser.
// These are configuration guards, NOT an audit of installed packages.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { test } from 'node:test';

const policyUrl = new URL('../.github/dependabot.yml', import.meta.url);
const workspaceUrl = new URL('../pnpm-workspace.yaml', import.meta.url);
const config = existsSync(policyUrl)
  ? JSON.parse(readFileSync(policyUrl, 'utf8'))
  : { updates: [] };

function updateFor(ecosystem) {
  const matches = config.updates.filter(
    (entry) => entry['package-ecosystem'] === ecosystem,
  );
  assert.equal(matches.length, 1, `Exactly one ${ecosystem} policy is required`);
  return matches[0];
}

function securityGroup(entry, name) {
  const group = entry.groups?.[name];
  assert.ok(group, `Missing security group: ${name}`);
  assert.equal(group['applies-to'], 'security-updates');
  return group;
}

test('a valid, explicit Dependabot v2 policy exists', () => {
  assert.ok(existsSync(policyUrl), 'Dependabot policy is missing');
  assert.equal(config.version, 2);
  assert.ok(Array.isArray(config.updates));
  assert.equal(config.updates.length, 2);
  assert.deepEqual(Object.keys(config).sort(), ['updates', 'version']);
});

test('npm coverage includes the application and standalone worker manifests', () => {
  const npm = updateFor('npm');
  assert.deepEqual([...npm.directories].sort(), ['/', '/workers/image-ai-worker']);
  assert.equal(new Set(npm.directories).size, npm.directories.length);
  assert.equal(Object.hasOwn(npm, 'directory'), false);
});

test('ordinary update PRs have bounded weekly schedules in the local timezone', () => {
  for (const [ecosystem, limit] of [['npm', 5], ['github-actions', 2]]) {
    const entry = updateFor(ecosystem);
    assert.equal(entry.schedule.interval, 'weekly');
    assert.equal(entry.schedule.day, 'monday');
    assert.equal(entry.schedule.timezone, 'Europe/Zurich');
    assert.match(entry.schedule.time, /^\d{2}:\d{2}$/);
    assert.equal(entry['open-pull-requests-limit'], limit);
  }
});

test('production and development security updates both remain covered', () => {
  const npm = updateFor('npm');
  for (const type of ['production', 'development']) {
    const group = securityGroup(npm, `security-${type}`);
    assert.equal(group['dependency-type'], type);
    assert.deepEqual(group.patterns, ['*']);
  }
  assert.equal(Object.hasOwn(npm.groups['security-production'], 'exclude-patterns'), false);
});

test('the Vitest security migration is isolated without suppressing its updates', () => {
  const npm = updateFor('npm');
  const names = Object.keys(npm.groups);
  const vitest = securityGroup(npm, 'security-vitest');
  assert.deepEqual(vitest.patterns, ['vitest', '@vitest/*']);
  assert.equal(Object.hasOwn(vitest, 'dependency-type'), false);
  assert.equal(Object.hasOwn(vitest, 'exclude-patterns'), false);
  assert.ok(names.indexOf('security-vitest') < names.indexOf('security-development'));
  assert.deepEqual(npm.groups['security-development']['exclude-patterns'], ['vitest', '@vitest/*']);
});

test('security groups do not filter out major-version fixes', () => {
  assert.ok(config.updates.length > 0);
  for (const entry of config.updates) {
    const groups = Object.values(entry.groups ?? {}).filter(
      (group) => group['applies-to'] === 'security-updates',
    );
    assert.ok(groups.length > 0);
    for (const group of groups) {
      assert.equal(Object.hasOwn(group, 'update-types'), false);
    }
  }
});

test('the updater has no advisory exclusions, alternate target or external-code opt-in', () => {
  assert.ok(config.updates.length > 0);
  for (const entry of config.updates) {
    for (const key of ['ignore', 'allow', 'target-branch', 'exclude-paths', 'registries', 'insecure-external-code-execution']) {
      assert.equal(Object.hasOwn(entry, key), false, `Unexpected updater option: ${key}`);
    }
  }
});

test('existing GitHub Actions dependencies have a dedicated update policy', () => {
  const actions = updateFor('github-actions');
  assert.equal(actions.directory, '/');
  const group = securityGroup(actions, 'security-actions');
  assert.deepEqual(group.patterns, ['*']);
  assert.equal(Object.hasOwn(group, 'exclude-patterns'), false);
});

test('pnpm audit does not silently ignore GHSA or CVE advisories', () => {
  const workspace = readFileSync(workspaceUrl, 'utf8');
  assert.doesNotMatch(workspace, /^\s*ignore(?:Ghsas|Cves)\s*:/m);
});
