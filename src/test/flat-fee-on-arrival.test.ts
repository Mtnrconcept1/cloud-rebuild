import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("facturation du forfait a l'arrivee", () => {
  const migration = read(
    "supabase/migrations/20260729160000_flat_fee_on_arrival_and_auto_arrival.sql",
  );
  const list = read("src/pages/dashboard/DashboardReservations.tsx");

  it("facture des le passage en arrivee, sans etape de cloture", () => {
    expect(migration).toContain("apply_flat_reservation_fee_on_arrival");
    expect(migration).toContain("NEW.billing_fee_chf := 5;");
    expect(migration).toContain("INSERT INTO public.reservation_flat_fee_charges");

    // Le garde de snapshot refuse toute ecriture du frais hors de ce reglage.
    expect(migration).toContain("set_config('app.fair_growth_mark_honored', 'on', true)");
  });

  it("s'execute avant le garde de snapshot", () => {
    // Les triggers d'un meme evenement se declenchent par ordre alphabetique :
    // « apply_ » doit preceder « set_reservation_fair_growth_snapshot », sinon
    // le garde voit une ecriture non autorisee et la refuse.
    expect(migration).toContain("CREATE TRIGGER apply_flat_reservation_fee_on_arrival");
    expect(migration).toContain("BEFORE UPDATE OF status ON public.reservations");
    expect("apply_flat_reservation_fee_on_arrival" < "set_reservation_fair_growth_snapshot").toBe(true);
  });

  it("ne refacture pas une table deja honoree", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.is_flat_arrival_billing_candidate");
    expect(migration).toContain("p_honored_at IS NULL");
    // Seul le franchissement compte : revenir d'un statut ulterieur ne
    // redeclenche pas la facturation.
    expect(migration).toContain("p_old_status, '') NOT IN ('arrived', 'seated', 'completed')");
    expect(migration).toContain("ON CONFLICT (reservation_id) DO NOTHING");
  });

  it("bascule les tables oubliees une heure apres l'horaire", () => {
    expect(migration).toContain("auto_arrive_overdue_reservations");
    expect(migration).toContain("- interval '1 hour'");
    expect(migration).toContain("cron.schedule");
    expect(migration).toContain("'*/10 * * * *'");

    // La bascule laisse une trace, sans quoi le restaurateur ne pourrait pas
    // distinguer une arrivee constatee d'une arrivee presumee pour se justifier.
    expect(migration).toContain("auto_arrived_at");
    expect(migration).toContain("auto_arrived_reason");

    // Une annulation echappe a la bascule.
    expect(migration).toContain("cancelled_by IS NULL");
  });

  it("retire l'etape de cloture de l'ecran, sans condition", () => {
    // Le forfait n'est plus un repli : « Mon pack » ayant disparu, il n'y a
    // plus de second modele, donc plus de drapeau a consulter avant de
    // masquer le parcours de cloture.
    expect(list).not.toContain("flatFeeBilling");
    expect(list).not.toContain("Clôturer la table");
    expect(list).not.toContain("dashboard-pack");
  });
});
