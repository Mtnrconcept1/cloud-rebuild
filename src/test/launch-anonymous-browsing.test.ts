import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync('supabase/migrations/20261012104500_launch_anonymous_browsing.sql', 'utf8');

describe('anonymous browsing during client-only launch restriction', () => {
  it('restores only anonymous policy results and keeps authenticated client blocking', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.launch_table_allowed');
    expect(sql).toMatch(/coalesce\(auth\.role\(\)\s*=\s*'anon',\s*false\)/i);
    expect(sql).toContain("IF coalesce(auth.role(),'') <> 'authenticated' THEN RETURN; END IF;");
    expect(sql).toContain("MESSAGE='TOK_LAUNCH_CLOSED'");
    expect(sql).not.toMatch(/DROP POLICY .* ON public\./i);
  });
  it('restores normal anonymous storage RLS without widening authenticated storage grants', () => {
    expect(sql).toContain('DROP POLICY IF EXISTS launch_access_guard ON storage.objects;');
    expect(sql).toContain('CREATE POLICY launch_access_guard ON storage.objects AS RESTRICTIVE');
    expect(sql).toContain('FOR ALL TO anon, authenticated');
    expect(sql).toContain('WITH CHECK');
    expect(sql).toContain("NOTIFY pgrst");
  });
});
