import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildErrorCodeMap } from '../../scripts/generate-error-code-map.mjs';
import { lookupErrorCodeSites } from '../../supabase/functions/_shared/error-code-map';

describe('error code case normalization', () => {
  it('indexes PRINT errors under the same key used by incident lookup', () => {
    const sites = lookupErrorCodeSites(' PRINT_SUBMISSION_RECONCILIATION_REQUIRED ');
    expect(sites.length).toBeGreaterThan(0);
    expect(sites).toEqual(lookupErrorCodeSites('print_submission_reconciliation_required'));
    for (const site of sites) {
      expect(readFileSync(site.file, 'utf8').split('\n')[site.line - 1]).toContain('PRINT_SUBMISSION_RECONCILIATION_REQUIRED');
    }
    expect(lookupErrorCodeSites('PRINT_UNKNOWN_FIXTURE_CODE')).toEqual([]);
  });

  it('preserves existing lowercase sites, caps additions and deduplicates aliases on one line', () => {
    const directory = mkdtempSync(join(tmpdir(), 'tok-error-map-'));
    try {
      const functions = join(directory, 'functions');
      mkdirSync(functions);
      writeFileSync(join(functions, 'a-uppercase.ts'), 'throw new HttpError(503, "SHARED_CODE");\n');
      writeFileSync(join(functions, 'b-lowercase.ts'), Array.from({ length: 12 }, () => 'throw new HttpError(503, "shared_code");').join('\n'));
      writeFileSync(join(functions, 'c-aliases.ts'), 'new HttpError(503, "PRINT_TEST"); new HttpError(503, "print_test"); new HttpError(503, "PRINT_TEST");');
      const map = buildErrorCodeMap(functions, directory);
      expect(map.shared_code).toEqual(Array.from({ length: 12 }, (_, index) => ({ file: 'functions/b-lowercase.ts', line: index + 1 })));
      expect(map.print_test).toEqual([{ file: 'functions/c-aliases.ts', line: 1 }]);
      expect(Object.keys(map)).toEqual(['print_test', 'shared_code']);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
