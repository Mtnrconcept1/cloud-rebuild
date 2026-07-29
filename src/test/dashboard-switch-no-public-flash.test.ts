import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("bascule entre espaces sans passage par l'accueil public", () => {
  const auth = read("src/lib/auth.tsx");
  const context = read("src/lib/auth-context.ts");
  const guard = read("src/components/ProtectedRoute.tsx");
  const roleAccess = read("src/lib/roleAccess.ts");

  it("distingue « aucun role » de « roles pas encore lus »", () => {
    // La liste des roles est videe avant d'etre rechargee. Sans marqueur, ce
    // creux est indiscernable d'un utilisateur sans aucun droit.
    expect(context).toContain("rolesResolved: boolean;");
    expect(auth).toContain("resolvedRolesUserId");
    expect(auth).toContain("rolesResolved: !user || resolvedRolesUserId === user.id");
  });

  it("invalide le marqueur a chaque remise a zero des roles", () => {
    // Sinon un changement de compte laisserait le marqueur d'un autre
    // utilisateur, et la garde autoriserait sur des droits perimes.
    const resets = auth.match(/setRoles\(\[\]\);/g)?.length ?? 0;
    const invalidations = auth.match(/setResolvedRolesUserId\(null\);/g)?.length ?? 0;
    expect(resets).toBeGreaterThan(0);
    expect(invalidations).toBeGreaterThanOrEqual(resets);
  });

  it("fait attendre la garde au lieu de rediriger", () => {
    // setLoading(true) se produit dans l'effet, donc apres un premier rendu ou
    // loading vaut encore faux et la liste est deja vide. Decider a cet instant
    // renvoyait vers getRoleHomePath(null), soit « / » : l'accueil public.
    expect(guard).toContain("if (loading || (user && !rolesResolved)) {");
    expect(roleAccess).toContain('return role ? ROLE_HOME_PATHS[role] : "/";');
  });
});
