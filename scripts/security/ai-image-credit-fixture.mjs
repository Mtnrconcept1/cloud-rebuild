import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = name => fs.readFileSync(path.join(root, 'supabase/migrations', name), 'utf8');
const escapeRegex = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function functionDdl(source, name, renamed = name) {
  const start = source.search(new RegExp(`CREATE OR REPLACE FUNCTION ${escapeRegex(name)}\\s*\\(`, 'i'));
  if (start < 0) throw new Error(`Missing native function ${name}`);
  const rest = source.slice(start);
  const body = /\bAS\s+(\$[a-zA-Z_0-9]*\$)/i.exec(rest);
  if (!body) throw new Error(`Missing SQL body ${name}`);
  const end = rest.indexOf(body[1], body.index + body[0].length);
  if (end < 0) throw new Error(`Missing SQL closing delimiter ${name}`);
  return rest.slice(0, end + body[1].length).replace(`FUNCTION ${name}`, `FUNCTION ${renamed}`) + ';';
}

function tableDdl(source, name) {
  const match = new RegExp(`CREATE TABLE IF NOT EXISTS ${escapeRegex(name)} \\([\\s\\S]*?\\n\\);`).exec(source);
  if (!match) throw new Error(`Missing native table ${name}`);
  return match[0];
}

function triggerDdl(source, name) {
  const match = new RegExp(`CREATE TRIGGER ${escapeRegex(name)}\\b[\\s\\S]*?;`).exec(source);
  if (!match) throw new Error(`Missing native trigger ${name}`);
  return match[0];
}

/** No stand-in credit calculator: every financial function is the exact current
 * historical definition, with only CREATE's name adjusted for its rename chain. */
export function nativeImageCreditFixtureSql() {
  const ai = read('20260601232854_tok_ai_tools.sql');
  const pricing = read('20260630131500_openai_x10_credit_pricing.sql');
  const guard = read('20260707173000_guard_tok_credit_spend.sql');
  const weekly = read('20261014110000_restaurant_preactivation_weekly_ai_credits.sql');
  const internal = read('20261014144637_mtnr_internal_unlimited_openai.sql');
  const gifts = read('20261014153000_admin_ai_gifts_fast_restaurants.sql');
  const view = /CREATE OR REPLACE VIEW private_finance\.chargeable_ai_usage_logs[\s\S]*?;/.exec(gifts)?.[0];
  if (!view) throw new Error('Missing native chargeable ledger view');
  return [
    fs.readFileSync(new URL('./ai-image-credit-fixture.sql', import.meta.url), 'utf8'),
    tableDdl(ai, 'public.ai_usage_logs'),
    'ALTER TABLE public.ai_usage_logs ADD COLUMN feature_name text;',
    tableDdl(ai, 'public.ai_generated_assets'),
    'GRANT SELECT,INSERT,UPDATE,DELETE ON public.ai_usage_logs,public.ai_generated_assets,public.ad_campaigns TO service_role;',
    tableDdl(internal, 'private_finance.internal_unlimited_openai_grants'),
    tableDdl(gifts, 'private_finance.admin_ai_credit_grants'),
    tableDdl(gifts, 'private_finance.admin_ai_credit_spends'),
    view,
    functionDdl(internal, 'private_finance.has_internal_unlimited_openai_grant'),
    functionDdl(internal, 'private_finance.get_restaurant_preactivation_credit_usage'),
    functionDdl(internal, 'public.get_restaurant_credit_usage_before_fair_growth'),
    functionDdl(weekly, 'public.get_restaurant_credit_usage', 'public.get_restaurant_credit_usage_before_internal_ai_grant'),
    functionDdl(internal, 'public.get_restaurant_credit_usage', 'public.get_restaurant_credit_usage_before_admin_ai_gifts'),
    functionDdl(gifts, 'private_finance.admin_ai_gift_balance'),
    functionDdl(gifts, 'public.get_restaurant_credit_usage'),
    functionDdl(guard, 'public.tok_credit_balance_from_usage'),
    functionDdl(weekly, 'public.guard_restaurant_tok_credit_spend'),
    functionDdl(pricing, 'public.normalize_photo_ai_usage_credit_units'),
    functionDdl(internal, 'private_finance.guard_internal_unlimited_ai_spend'),
    functionDdl(gifts, 'private_finance.apply_admin_ai_gift_on_usage'),
    functionDdl(gifts, 'private_finance.guard_admin_ai_gift_campaign'),
    triggerDdl(guard, 'guard_tok_credit_spend_ai_usage_logs'),
    triggerDdl(guard, 'guard_tok_credit_spend_ad_campaigns'),
    triggerDdl(pricing, 'normalize_photo_ai_usage_credit_units'),
    triggerDdl(internal, 'guard_internal_unlimited_ai_usage'),
    triggerDdl(internal, 'guard_internal_unlimited_campaign_spend'),
    triggerDdl(gifts, 'zz_admin_apply_ai_gift_credit'),
    triggerDdl(gifts, 'zz_admin_protect_gift_campaign'),
  ].join('\n\n');
}

export const imageCreditMigrationSql = () => read('20261018141000_ai_image_credit_reservations.sql');

// Emit reviewed fixture input for a local disposable PostgreSQL/PGlite runtime.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] !== '--emit') throw new Error('Use --emit to print fixture SQL; this module never connects to a database');
  process.stdout.write(nativeImageCreditFixtureSql());
}
