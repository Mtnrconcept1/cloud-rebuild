import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

// Read-only comparison against the SQL actually recorded in production on 2026-10-27.
// Restoring this file must never rewrite or falsely revert remote migration history.
const directory = 'supabase/migrations';
const name = '20261027161330_native_tok_contact_permissions.sql';
const sha256 = 'b633d2615d824cf9ba6c77d2897053b1c7fce7dae0a74352e61cfac034ff1218';

test('preserves the exact applied native consent migration at its recorded version', () => {
  const bytes = readFileSync(`${directory}/${name}`);
  assert.equal(bytes.length, 7862);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), sha256);
});

test('does not replay the same historical migration under a second version', () => {
  const copies = readdirSync(directory).filter(file => file.endsWith('_native_tok_contact_permissions.sql'));
  assert.deepEqual(copies, [name]);
});
