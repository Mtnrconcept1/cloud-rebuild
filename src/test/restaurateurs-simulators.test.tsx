import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import RestaurateursGeneve from "@/pages/RestaurateursGeneve";
import RestaurateursGoogleBusiness from "@/pages/RestaurateursGoogleBusiness";
import AlternativeCommissionCouvert from "@/pages/AlternativeCommissionCouvert";

vi.mock("@/hooks/useSeoMeta", () => ({ useSeoMeta: vi.fn() }));
vi.mock("@/lib/support/contactSupport", () => ({ submitContactSupport: vi.fn() }));
vi.mock("@/components/security/TurnstileCaptcha", () => ({ default: () => null }));

afterEach(cleanup);

function table(name: string) {
  return within(screen.getByRole("table", { name }));
}

function row(name: string, label: string) {
  return table(name).getByRole("row", { name: new RegExp(label) }).textContent!.replace(/[\u202f\u00a0]/g, " ");
}

describe("Public restaurant simulations", () => {
  it("uses a table's whole bill and a distinct order amount, and rejects negative inputs", () => {
    render(<MemoryRouter><RestaurateursGeneve /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText("Tables réellement servies / mois"), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText("Addition moyenne par table (CHF)"), { target: { value: "100" } });
    fireEvent.change(screen.getByLabelText("Commandes par mois"), { target: { value: "20" } });
    fireEvent.change(screen.getByLabelText("Montant moyen par commande (CHF)"), { target: { value: "30" } });
    const name = "Comment lire votre simulation mensuelle";
    expect(row(name, "Total des ventes simulées")).toContain("1 600 CHF");
    expect(row(name, "Budget marketing facultatif")).toContain("192 CHF");
    expect(row(name, "Coût TOK des réservations")).toContain("179 CHF");
    fireEvent.change(screen.getByLabelText("Tables réellement servies / mois"), { target: { value: "-10" } });
    expect(screen.getByLabelText("Tables réellement servies / mois")).toHaveValue(0);
    expect(row(name, "Total des ventes simulées")).toContain("600 CHF");
  });

  it("includes the official selected pack, updates the Google comparison and explains a loss", () => {
    render(<MemoryRouter><RestaurateursGoogleBusiness /></MemoryRouter>);
    const name = "Détail du calcul avec vos valeurs";
    expect(row(name, "TOK : total / mois")).toContain("729 CHF");
    expect(row(name, "Écart / mois")).toContain("1 503 CHF");
    fireEvent.change(screen.getByLabelText("Abonnement TOK · paiement mensuel"), { target: { value: "elite" } });
    expect(row(name, "TOK : total / mois")).toContain("1 099 CHF");
    fireEvent.change(screen.getByLabelText("Tables réellement servies depuis Google / mois"), { target: { value: "0" } });
    expect(screen.getByRole("status")).toHaveTextContent("499 CHF de plus par mois");
    expect(row(name, "Coût TOK moyen par personne")).toContain("Non applicable");
    expect(screen.getByRole("link", { name: /Préparer ma demande d'audit/ }).getAttribute("href")).toMatch(/^mailto:/);
  });

  it("keeps fractional expected attendance consistent with fees and retains the pack at 100% absences", () => {
    render(<MemoryRouter><AlternativeCommissionCouvert /></MemoryRouter>);
    const name = "Le détail de votre calcul mensuel";
    expect(row(name, "1. Tables servies estimées")).toContain("82,8");
    expect(row(name, "2. Personnes servies estimées")).toContain("198,72");
    expect(row(name, "3. Coût du modèle au couvert")).toContain("1 192,32 CHF");
    expect(row(name, "6. Total TOK")).toContain("483 CHF");
    expect(row(name, "7. Différence mensuelle")).toContain("709,32 CHF de moins");
    fireEvent.change(screen.getByLabelText("Annulations ou absences (%)"), { target: { value: "150" } });
    expect(screen.getByLabelText("Annulations ou absences (%)")).toHaveValue(100);
    expect(row(name, "6. Total TOK")).toContain("69 CHF");
    expect(row(name, "8. Coût TOK par personne")).toContain("Non calculable");
    fireEvent.change(screen.getByLabelText("Annulations ou absences (%)"), { target: { value: "0" } });
    fireEvent.change(screen.getByLabelText("Commission comparée par personne (CHF)"), { target: { value: "0" } });
    expect(row(name, "7. Différence mensuelle")).toContain("519 CHF de plus");
  });
});
