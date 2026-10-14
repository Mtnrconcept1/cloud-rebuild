import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe,it,expect } from "vitest";

const migration=readFileSync(resolve(process.cwd(),"supabase/migrations/20261014165500_tok_workforce_restaurants.sql"),"utf8");

describe("TOK Équipe — invariants de migration",()=>{
  const tables=["settings","employees","shifts","time_entries","validations","absences","requests","exchanges","access_audit"];
  for(const table of tables){
    it("protège "+table+" par RLS",()=>{
      const full="tok_workforce_"+table;
      expect(migration).toContain("CREATE TABLE public."+full);
      expect(migration).toContain("ALTER TABLE public."+full+" ENABLE ROW LEVEL SECURITY");
    });
  }
  it("utilise des blocs SQL dollar-quotés complets",()=>{
    expect(migration).not.toMatch(/\bAS \$(?!\$)/);
    const opens=(migration.match(/\bAS \$\$/g)||[]).length;
    const closes=(migration.match(/\$\$;/g)||[]).length;
    expect(opens).toBe(5);
    expect(closes).toBe(opens);
  });
  it("désactive le module par défaut et limite l'activation aux admins",()=>{
    expect(migration).toContain("enabled boolean NOT NULL DEFAULT false");
    expect(migration).toContain("tok_workforce_settings_admin_insert");
    expect(migration).toContain("tok_workforce_settings_admin_update");
    expect(migration).toContain("updated_by=(SELECT auth.uid())");
    expect(migration).toContain("tok_workforce_settings_audit");
  });
  it("impose les liaisons restaurant/employé et protège le dialogue entre services",()=>{
    expect(migration).toContain("FOREIGN KEY(restaurant_id,employee_id)");
    expect(migration).toContain("FOREIGN KEY(restaurant_id,target_employee_id)");
    expect(migration).toContain("REVOKE UPDATE, DELETE ON public.tok_workforce_exchanges FROM authenticated");
    expect(migration).toContain("CREATE FUNCTION public.tok_workforce_review_exchange");
    expect(migration).toContain("SECURITY DEFINER SET search_path=''");
  });
  it("protège les attestations et refuse l'accès anonyme",()=>{
    expect(migration).toContain("tok_workforce_guard_validated_entry");
    expect(migration).toContain("tok_workforce_lock_approved_hours");
    expect(migration).toContain("tok_workforce_access_audit FROM anon");
    expect(migration).toContain("CREATE POLICY tok_workforce_validations_sign");
  });
});
