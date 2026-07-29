import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("attribution du role commercial depuis l'onglet Utilisateurs", () => {
  const migration = read("supabase/migrations/20260729120000_allow_admin_managed_commercial_role.sql");
  const adminUsers = read("src/pages/admin/AdminUtilisateurs.tsx");

  it("garde le role reserve a une decision administrateur", () => {
    // La protection reelle : nul ne s'attribue le role lui-meme.
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.guard_commercial_role_assignment");
    expect(migration).toContain("Commercial accounts are administrator-managed");
    expect(migration).toContain("v_is_service_role OR v_is_admin");
  });

  it("n'exige plus un compte de demonstration pour un commercial reel", () => {
    // « Commercial » est un role metier — la RPC lui ouvre un profil de
    // remuneration — alors que commercial_demo_accounts ne decrit que les
    // comptes de demo isoles. Confondre les deux rendait la creation d'un
    // commercial reel impossible depuis l'interface d'administration.
    // On regarde le corps execute, pas l'en-tete : le commentaire cite la
    // table justement pour expliquer pourquoi elle n'est plus consultee.
    const body = migration.split("AS $function$")[1]?.split("$function$;")[0] ?? "";
    expect(body).toBeTruthy();
    expect(body).not.toContain("commercial_demo_accounts");
    expect(migration).not.toContain("Commercial role requires an active administrator-managed demo account");
  });

  it("active le role pour le compte demande, profil de remuneration compris", () => {
    expect(migration).toContain("rbarman@hotmail.ch");
    expect(migration).toContain("'commercial'::public.app_role");
    expect(migration).toContain("public.commercial_compensation_profiles");
    // Rejouable sans effet de bord.
    expect(migration).toContain("ON CONFLICT (user_id, role) DO NOTHING");
  });

  it("laisse son etape de donnees franchir son propre garde-fou", () => {
    // Une migration ne s'execute ni comme service_role ni comme administrateur
    // authentifie : auth.role() et auth_is_admin() y sont faux. Sans cette
    // desactivation, le garde-fou installe quelques lignes plus haut refuse
    // l'attribution que la meme migration cherche a poser, et le deploiement
    // echoue en 42501. La preproduction ne l'avait pas vu : auth.users y est
    // vide, donc le bloc sortait avant d'atteindre l'insertion.
    expect(migration).toContain(
      "ALTER TABLE public.user_roles DISABLE TRIGGER guard_commercial_role_assignment;",
    );
    expect(migration).toContain(
      "ALTER TABLE public.user_roles ENABLE TRIGGER guard_commercial_role_assignment;",
    );

    // La desactivation doit encadrer l'etape de donnees, et la reactivation
    // survenir apres : un ordre inverse laisserait le garde-fou hors service.
    const off = migration.indexOf("DISABLE TRIGGER guard_commercial_role_assignment");
    const insert = migration.indexOf("INSERT INTO public.user_roles");
    const on = migration.indexOf("ENABLE TRIGGER guard_commercial_role_assignment");
    expect(off).toBeGreaterThan(-1);
    expect(insert).toBeGreaterThan(off);
    expect(on).toBeGreaterThan(insert);
  });

  it("laisse l'interface proposer le role", () => {
    expect(adminUsers).toContain('"commercial"');
    expect(adminUsers).toContain("AVAILABLE_ROLES");
  });
});
