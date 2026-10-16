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
  // ICU uses narrow spaces on Windows and apostrophes on some Linux builds.
  return table(name).getByRole("row", { name: new RegExp(label) }).textContent!.replace(/[\u202f\u00a0'’]/g, " ");
}

describe("Public restaurant simulations", () => {
  it("uses a table's whole bill and a distinct order amount, and rejects negative inputs", () => {
    render(<MemoryRouter><RestaurateursGeneve /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText("Tables réellement servies / mois"), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText("Addition moyenne par table (CHF)"), { target: { value: "100" } });
    fireEvent.change(screen.getByLabelText("Commandes par mois"), { target: { value: "20" } });
    fireEvent.change(screen.getByLabelText("Montant moyen par commande (CHF)"), { target: { value: "30" } });
    fireEvent.click(screen.getByText("Voir toutes les hypothèses et les calculs"));
    const name = "Comment lire votre simulation mensuelle";
    expect(row(name, "Total des ventes simulées")).toContain("1 600 CHF");
    expect(row(name, "Budget marketing facultatif")).toContain("192 CHF");
    expect(row(name, "Coût TOK des réservations")).toContain("179 CHF");
    fireEvent.change(screen.getByLabelText("Tables réellement servies / mois"), { target: { value: "-10" } });
    expect(screen.getByLabelText("Tables réellement servies / mois")).toHaveValue(0);
    expect(row(name, "Total des ventes simulées")).toContain("600 CHF");
  });

  it("reproduces the reference and shows the subscription beside the reservation-only result", () => {
    render(<MemoryRouter><RestaurateursGoogleBusiness /></MemoryRouter>);
    const name = "TOK et modèle au couvert : comparaison sur les mêmes tables";
    expect(row(name, "Total de couverts")).toContain("272");
    expect(row(name, "Frais de réservation")).toContain("400 CHF");
    expect(row(name, "Frais de réservation")).toContain("1 088 CHF");
    expect(screen.getByRole("status")).toHaveTextContent("688 CHF d'économie avec TOK");
    expect(screen.getByRole("status")).toHaveTextContent("63,2 %");
    expect(screen.getAllByText(/400 CHF.*129 CHF/).some((element) => element.textContent?.includes("529 CHF"))).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Avec l'abonnement TOK" }));
    expect(row(name, "Total comparé / mois")).toContain("529 CHF");
    expect(screen.getByRole("status")).toHaveTextContent("559 CHF d'économie");
    fireEvent.change(screen.getByLabelText("Votre abonnement TOK"), { target: { value: "elite" } });
    expect(row(name, "Total comparé / mois")).toContain("899 CHF");
    fireEvent.change(screen.getByLabelText("Tables servies / mois"), { target: { value: "0" } });
    expect(screen.getByRole("status")).toHaveTextContent("499 CHF de plus avec TOK");
    expect(screen.getByRole("status")).toHaveTextContent("Pourcentage non calculable");
    fireEvent.click(screen.getByText("Voir toutes les formules, le coût par personne et le calcul annuel"));
    expect(row("Détail du calcul avec vos valeurs", "Coût TOK moyen par personne")).toContain("Non applicable");
    expect(screen.getByRole("link", { name: /Préparer ma demande d'audit/ }).getAttribute("href")).toMatch(/^mailto:/);
  });

  it("compares identical attendance, clamps absences, and restores the simple example", () => {
    render(<MemoryRouter><AlternativeCommissionCouvert /></MemoryRouter>);
    const name = "TOK et modèle au couvert : comparaison sur les mêmes tables";
    fireEvent.click(screen.getByRole("button", { name: "Avec l'abonnement TOK" }));
    expect(row(name, "Total comparé / mois")).toContain("469 CHF");
    fireEvent.click(screen.getByText("Vous prévoyez des annulations ou des absences ?"));
    fireEvent.change(screen.getByLabelText("Annulations ou absences (%)"), { target: { value: "150" } });
    expect(screen.getByLabelText("Annulations ou absences (%)")).toHaveValue(100);
    expect(row(name, "Total comparé / mois")).toContain("69 CHF");
    expect(screen.getByRole("status")).toHaveTextContent("69 CHF de plus");
    fireEvent.click(screen.getByRole("button", { name: "Exemple : 80 tables" }));
    expect(screen.getByLabelText("Annulations ou absences (%)")).toHaveValue(0);
    expect(screen.getByRole("status")).toHaveTextContent("688 CHF d'économie");
    fireEvent.change(screen.getByLabelText("Tables réservées / mois"), { target: { value: "90" } });
    fireEvent.change(screen.getByLabelText("Clients par table, en moyenne"), { target: { value: "2.4" } });
    fireEvent.change(screen.getByLabelText("Frais du modèle au couvert"), { target: { value: "6" } });
    fireEvent.change(screen.getByLabelText("Annulations ou absences (%)"), { target: { value: "8" } });
    fireEvent.click(screen.getByText("Voir le détail des calculs et les réservations après absences"));
    const detail = "Le détail de votre calcul mensuel";
    expect(row(detail, "1. Tables servies estimées")).toContain("82,8");
    expect(row(detail, "2. Personnes servies estimées")).toContain("198,72");
    expect(row(detail, "6. Total TOK")).toContain("483 CHF");
    expect(row(detail, "7. Différence mensuelle")).toContain("709,32 CHF de moins");
    fireEvent.change(screen.getByLabelText("Tables réservées / mois"), { target: { value: "-20" } });
    expect(screen.getByLabelText("Tables réservées / mois")).toHaveValue(0);
  });
});
