import { describe,it,expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const sql=readFileSync(resolve(process.cwd(),"supabase/migrations/20261014180000_tok_workforce_clock_teams.sql"),"utf8");
const app=readFileSync(resolve(process.cwd(),"src/App.tsx"),"utf8");
const portal=readFileSync(resolve(process.cwd(),"src/pages/workforce/MyWorkforce.tsx"),"utf8");
describe("TOK Équipe — badgeuse et droits employés",()=>{
 it("crée les tables avec RLS et sans accès en écriture direct",()=>{
  for(const table of ["tok_workforce_clock_sessions","tok_workforce_clock_events"]){
   expect(sql).toContain("CREATE TABLE public."+table);
   expect(sql).toContain("ALTER TABLE public."+table+" ENABLE ROW LEVEL SECURITY");
  }
  expect(sql).toContain("GRANT SELECT ON public.tok_workforce_clock_sessions,public.tok_workforce_clock_events TO authenticated");
  expect(sql).not.toMatch(/GRANT (INSERT|UPDATE|DELETE) ON public.tok_workforce_clock_sessions/);
  expect(sql).toContain("tok_workforce_clock_one_active");
 });
 it("utilise exclusivement une horloge serveur et un workflow atomique",()=>{
  expect(sql).toContain("clock_timestamp()");
  expect(sql).toContain("FOR UPDATE");
  expect(sql).toContain("EXTRACT(EPOCH FROM v_now");
  expect(sql).toContain("tok_workforce_punch");
  expect(sql).toContain("p_action NOT IN ('clock_in','break_start','break_end','clock_out')");
  expect(sql).toContain("DROP POLICY IF EXISTS tok_workforce_entries_self_insert");
  expect(sql).not.toContain("p_client_timestamp");
 });
 it("ne mélange pas les collaborateurs des restaurants",()=>{
  expect(sql).toContain("FOREIGN KEY (restaurant_id,employee_id)");
  expect(sql).toContain("e.restaurant_id=p_restaurant_id AND e.user_id=v_actor AND e.is_active");
  expect(sql).toContain("u.email_confirmed_at IS NOT NULL");
  expect(sql).toContain("tok_workforce_can_manage(restaurant_id)");
  expect(sql).toContain("tok_workforce_can_schedule");
  expect(sql).toContain("signature_data");
  expect(sql).toContain("tok_workforce_shift_absence_guard");
  expect(sql).toContain("tok_workforce_absence_shift_guard");
  expect(sql).toContain("tok_workforce_review_request");
  expect(sql).toContain("target_accepted_at IS NULL THEN RAISE EXCEPTION");
 });
 it("autorise le portail uniquement aux comptes connectés",()=>{
  expect(app).toContain('<Route path="/equipe/mon-espace" element={<ProtectedRoute><MyWorkforce /></ProtectedRoute>} />');
  expect(portal).toContain("tok_workforce_claim_employee");
  expect(portal).toContain("tok_workforce_my_restaurants");
 });
 it("équilibre les blocs de fonctions PostgreSQL",()=>{
  const starts=(sql.match(/AS \$\$/g)||[]).length;
  const ends=(sql.match(/\$\$;/g)||[]).length;
  expect(starts).toBe(9);
  expect(ends).toBe(starts);
  expect(sql).not.toMatch(/\bAS \$(?!\$)/);
 });
});
