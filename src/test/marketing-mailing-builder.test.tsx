import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MarketingMailingBuilder } from "@/components/marketing/MarketingMailingBuilder";
const { bff, estimate } = vi.hoisted(() => ({ bff: vi.fn(), estimate: vi.fn() }));
vi.mock("@/marketing/marketingBffClient", () => ({ MARKETING_BFF_ENDPOINTS: { agent: "/api/marketing/agent" }, marketingBffRequest: bff }));
vi.mock("@/marketing/marketingClient", () => ({ estimateMarketingAudience: estimate }));
beforeEach(() => {
  bff.mockReset(); estimate.mockReset();
  bff.mockImplementation((_url, { body }) => Promise.resolve(body.action === "interpret_mailing"
    ? { mailingOptions: { selections: { city: ["Genève"], category: ["Pizzeria"] }, emailCount: 4, cadence: "weekly" }, summary: "Pizzerias à Genève", unresolved: [] }
    : { items: (body.field === "city" ? ["Genève", "Carouge"] : ["Pizzeria", "Japonais"]).map((value) => ({ value, count: 3 })), next: null }));
  estimate.mockResolvedValue({ total: 3, eligible: 2, byChannel: { email: 2 }, availabilityByChannel: { email: "available" } });
});
function setup(disabled = false) {
  const onGenerate = vi.fn().mockResolvedValue(undefined);
  render(<MarketingMailingBuilder pending={false} disabled={disabled} onGenerate={onGenerate} />);
  fireEvent.click(screen.getByRole("button", { name: "Utiliser l’exemple pizzerias" }));
  return onGenerate;
}
describe("mailing checkboxes and preview", () => {
  it("selects pizzerias in every area, then all categories in one area without retaining a stale estimate", async () => {
    const generate = setup();
    fireEvent.click(await screen.findByRole("checkbox", { name: "Pizzeria (3)" }));
    fireEvent.click(screen.getByRole("button", { name: "Vérifier les destinataires" }));
    await waitFor(() => expect(estimate).toHaveBeenLastCalledWith({ audience_kind: "restaurant", selections: { category: ["Pizzeria"] } }, ["email"]));
    fireEvent.click(screen.getByRole("button", { name: "Générer les e-mails et la bannière TOK" }));
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate.mock.calls[0][0].mailingOptions.selections).toEqual({ category: ["Pizzeria"] });
    fireEvent.click(screen.getByRole("checkbox", { name: "Tous — cuisines / catégories" }));
    fireEvent.click(await screen.findByRole("checkbox", { name: "Genève (3)" }));
    expect(screen.getByRole("button", { name: "Générer les e-mails et la bannière TOK" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Vérifier les destinataires" }));
    await waitFor(() => expect(estimate).toHaveBeenLastCalledWith({ audience_kind: "restaurant", selections: { city: ["Genève"] } }, ["email"]));
  });
  it("interprets four weekly mails and requires an audience count before generation", async () => {
    const generate = setup();
    fireEvent.click(screen.getByRole("button", { name: "Interpréter le brief" }));
    await screen.findByText("Pizzerias à Genève");
    expect(screen.getByLabelText("Nombre d’e-mails")).toHaveValue(4);
    expect(screen.getByLabelText("Rythme des e-mails")).toHaveValue("weekly");
    expect(screen.getByRole("button", { name: "Générer les e-mails et la bannière TOK" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Vérifier les destinataires" }));
    await screen.findByText("3 restaurants correspondants");
    fireEvent.click(screen.getByRole("button", { name: "Générer les e-mails et la bannière TOK" }));
    expect(generate.mock.calls[0][0]).toMatchObject({ channels: ["email"], itemCount: 4, mailingOptions: { selections: { city: ["Genève"], category: ["Pizzeria"] }, cadence: "weekly" } });
    expect(generate.mock.calls[0][0]).not.toHaveProperty("approved");
  });
  it("never treats an empty rubric as all", () => {
    setup();
    fireEvent.click(screen.getByRole("checkbox", { name: "Tous — villes" }));
    expect(screen.getByRole("button", { name: "Vérifier les destinataires" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Générer les e-mails et la bannière TOK" })).toBeDisabled();
  });
  it("preserves read-only mode without requesting protected facets", () => {
    setup(true);
    expect(screen.getByLabelText("Décrivez votre campagne mailing")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Interpréter le brief" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Vérifier les destinataires" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Générer les e-mails et la bannière TOK" })).toBeDisabled();
    expect(bff).not.toHaveBeenCalled();
  });
  it("reports missing email configuration while allowing draft preparation", async () => {
    estimate.mockResolvedValue({ total: 3, eligible: 0, byChannel: { email: 0 }, availabilityByChannel: { email: "blocked_configuration" } });
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Vérifier les destinataires" }));
    expect(await screen.findByText(/La connexion e-mail doit être configurée/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Générer les e-mails et la bannière TOK" })).toBeEnabled();
  });
  it("shows failed facet loading with retry instead of inventing categories", async () => {
    bff.mockRejectedValue(new Error("Rubrique indisponible"));
    setup();
    const errors = await screen.findAllByRole("alert");
    expect(within(errors[0]).getByRole("button", { name: "Réessayer" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Pizzeria (3)" })).not.toBeInTheDocument();
  });
});
