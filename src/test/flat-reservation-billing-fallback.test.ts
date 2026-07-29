import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("facturation de repli quand Mon pack / Fair Growth sont coupes", () => {
  const migration = read(
    "supabase/migrations/20260729110000_flat_reservation_billing_when_modules_disabled.sql",
  );

  it("declenche le repli sur la coupure globale du module", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION private_finance.flat_reservation_billing_active");
    expect(migration).toContain("flag.name = 'dashboard-pack'");

    // Un drapeau absent doit activer le repli, pas facturer zero en silence.
    expect(migration).toContain("SELECT NOT COALESCE(");
  });

  it("facture un forfait de 5.- sur toute reservation honoree", () => {
    // Le barometre Fair Growth — source marketplace et plafond de 7 % — ne
    // s'applique plus : le forfait est du quelle que soit l'origine du client.
    expect(migration).toContain("IF v_flat_billing THEN");
    expect(migration).toContain("v_fee_cents := 500;");

    // La branche Fair Growth reste intacte pour le mode normal.
    expect(migration).toContain("COALESCE(v_reservation.reservation_fee_cap_bps_snapshot, 700)");
  });

  it("n'ecrit pas le forfait dans le registre Fair Growth", () => {
    // reservation_fee_charges garantit par contrainte CHECK la source
    // marketplace et l'egalite fee = LEAST(forfait, plafond). Un forfait sans
    // plafond violerait les deux ; affaiblir ces contraintes les perdrait
    // aussi pour le mode normal, une fois le module reactive.
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.reservation_flat_fee_charges");
    expect(migration).toContain("INSERT INTO public.reservation_flat_fee_charges");
    expect(migration).toContain("ELSIF v_reservation.acquisition_source = 'tok_marketplace'");

    // Le montant est fige : toute autre valeur signale une regression.
    expect(migration).toContain("CHECK (fee_cents = 500)");

    // Journal ferme, comme le registre Fair Growth.
    expect(migration).toContain("ALTER TABLE public.reservation_flat_fee_charges ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("REVOKE ALL ON public.reservation_flat_fee_charges FROM anon, authenticated");
  });

  it("passe par le point d'entree audite plutot qu'un ecrivain concurrent", () => {
    // billing_fee_chf n'est modifiable que sous le garde
    // app.fair_growth_mark_honored : un trigger concurrent serait rejete par
    // use_mark_reservation_honored_rpc. Le repli vit donc dans la RPC elle-meme.
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.mark_reservation_honored");
    expect(migration).toContain("set_config('app.fair_growth_mark_honored', 'on', true)");
    expect(migration).toContain("billing_fee_chf = v_fee_cents::numeric / 100");
  });
});
