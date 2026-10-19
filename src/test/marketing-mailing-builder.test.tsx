import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MarketingMailingBuilder } from "@/components/marketing/MarketingMailingBuilder";
const { bff, estimate, prepareRecipients, parseFile } = vi.hoisted(() => ({ bff: vi.fn(), estimate: vi.fn(), prepareRecipients: vi.fn(), parseFile: vi.fn() }));
vi.mock("@/marketing/marketingBffClient", () => ({ MARKETING_BFF_ENDPOINTS: { agent: "/api/marketing/agent" }, marketingBffRequest: bff }));
vi.mock("@/marketing/marketingClient", () => ({ estimateMarketingAudience: estimate, prepareMarketingMailingRecipients: prepareRecipients }));
vi.mock("@/marketing/mailingRecipients", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/marketing/mailingRecipients")>(), parseMailingRecipientsFile: parseFile,
}));
beforeEach(() => {
  bff.mockReset(); estimate.mockReset(); prepareRecipients.mockReset(); parseFile.mockReset();
  bff.mockImplementation((_url, { body }) => Promise.resolve(body.action === "interpret_mailing"
    ? { mailingOptions: { selections: { city: ["Genève"], category: ["Pizzeria"] }, emailCount: 4, cadence: "weekly" }, summary: "Pizzerias à Genève", unresolved: [] }
    : { items: (body.field === "city" ? ["Genève", "Carouge"] : ["Pizzeria", "Japonais"]).map((value) => ({ value, count: 3 })), next: null }));
  estimate.mockResolvedValue({ total: 3, eligible: 2, byChannel: { email: 2 }, availabilityByChannel: { email: "available" } });
  prepareRecipients.mockImplementation(async (emails: string[]) => ({ createdCount: emails.length, estimate: { total: emails.length, eligible: 0, byChannel: { email: 0 }, availabilityByChannel: { email: "available" } } }));
});
function setup(disabled = false, imageMode: "generated" | "manual" | null = "generated") {
  const onGenerate = vi.fn().mockResolvedValue(undefined);
  render(<MarketingMailingBuilder pending={false} disabled={disabled} onGenerate={onGenerate} />);
  fireEvent.click(screen.getByRole("button", { name: "Utiliser l’exemple pizzerias" }));
  if (imageMode) fireEvent.click(screen.getByRole("radio", { name: imageMode === "manual" ? /^Import manuel/ : /^Image générée/ }));
  return onGenerate;
}
describe("mailing checkboxes and preview", () => {
  it("requires an explicit image choice before generation", async () => {
    const generate = setup(false, null);
    expect(screen.getByRole("radio", { name: /^Image générée/ })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: /^Import manuel/ })).not.toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Vérifier les destinataires" }));
    await screen.findByText("3 restaurants correspondants");
    expect(screen.getByRole("button", { name: "Générer les e-mails et la bannière TOK" })).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: /^Image générée/ }));
    fireEvent.click(screen.getByRole("button", { name: "Générer les e-mails et la bannière TOK" }));
    expect(generate.mock.calls[0][0].mailingOptions.imageMode).toBe("generated");
  });
  it("keeps the manual image choice when interpreting a twelve-email campaign", async () => {
    bff.mockImplementation((_url, { body }) => Promise.resolve(body.action === "interpret_mailing"
      ? { mailingOptions: { selections: { city: ["Genève"] }, emailCount: 12, cadence: "weekly", imageMode: "generated" }, summary: "Douze e-mails", unresolved: [] }
      : { items: [], next: null }));
    const generate = setup(false, "manual");
    fireEvent.click(screen.getByRole("button", { name: "Interpréter le brief" }));
    await screen.findByText("Douze e-mails");
    expect(screen.getByRole("radio", { name: /^Import manuel/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /^Image générée/ })).not.toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Vérifier les destinataires" }));
    await screen.findByText("3 restaurants correspondants");
    fireEvent.click(screen.getByRole("button", { name: "Générer les textes des e-mails" }));
    expect(generate.mock.calls[0][0]).toMatchObject({ itemCount: 12, mailingOptions: { imageMode: "manual", emailCount: 12 } });
  });
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

describe("explicit mailing recipients", () => {
  const chooseList = () => fireEvent.click(screen.getByRole("radio", { name: "Liste d’adresses e-mail" }));
  const prepare = () => screen.getByRole("button", { name: "Enregistrer et vérifier les destinataires" });
  it("requires removal of invalid entries, deduplicates and targets only the reviewed list", async () => {
    const generate = setup(false, "manual"); chooseList();
    fireEvent.change(screen.getByLabelText("Adresses e-mail des destinataires"), { target: { value: " A@Example.test; a@example.test; broken\nb@example.test" } });
    expect(screen.getByText("2 adresse(s) valide(s) · 1 doublon(s) · 1 entrée(s) invalide(s)")).toBeInTheDocument();
    expect(prepare()).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Garder uniquement les adresses valides" }));
    fireEvent.click(prepare());
    await screen.findByText("2 destinataires sélectionnés");
    expect(prepareRecipients).toHaveBeenCalledWith(["a@example.test", "b@example.test"]);
    expect(estimate).not.toHaveBeenCalled();
    expect(screen.getByText(/2 nouvelle\(s\) fiche/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Générer les textes des e-mails" }));
    expect(generate.mock.calls[0][0]).toMatchObject({ audienceHint: "2 destinataires sélectionnés", mailingOptions: {
      selections: {}, recipientEmails: ["a@example.test", "b@example.test"], imageMode: "manual",
    } });
    expect(generate.mock.calls[0][0].audienceHint).not.toContain("@");
    fireEvent.change(screen.getByLabelText("Adresses e-mail des destinataires"), { target: { value: "c@example.test" } });
    expect(screen.getByRole("button", { name: "Générer les textes des e-mails" })).toBeDisabled();
  });
  it("retains explicit addresses while the brief interprets restaurant criteria", async () => {
    setup(); chooseList();
    fireEvent.change(screen.getByLabelText("Adresses e-mail des destinataires"), { target: { value: "chosen@example.test" } });
    fireEvent.click(screen.getByRole("button", { name: "Interpréter le brief" }));
    await screen.findByText("Pizzerias à Genève");
    expect(screen.getByLabelText("Adresses e-mail des destinataires")).toHaveValue("chosen@example.test");
    fireEvent.click(prepare());
    await waitFor(() => expect(prepareRecipients).toHaveBeenCalledWith(["chosen@example.test"]));
  });
  it("previews files and requires confirmation before adding valid addresses", async () => {
    parseFile.mockResolvedValue({ emails: ["a@example.test", "b@example.test"], duplicateCount: 1, invalidCount: 1,
      invalidEntries: ["Ligne 3 : invalide"], totalCount: 4, warnings: ["La feuille masquée a été ignorée."] });
    setup(); chooseList();
    fireEvent.change(screen.getByLabelText("Adresses e-mail des destinataires"), { target: { value: "a@example.test" } });
    const file = new File(["fixture"], "contacts.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    fireEvent.change(screen.getByLabelText("Importer un fichier CSV, XLS ou XLSX"), { target: { files: [file] } });
    const preview = await screen.findByRole("region", { name: "Aperçu du fichier destinataires" });
    expect(within(preview).getByText("La feuille masquée a été ignorée.")).toBeInTheDocument();
    expect(within(preview).getByText("Ligne 3 : invalide")).toBeInTheDocument();
    expect(prepare()).toBeDisabled();
    expect(prepareRecipients).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Adresses e-mail des destinataires")).toHaveValue("a@example.test");
    fireEvent.click(within(preview).getByRole("button", { name: "Ajouter les 2 adresses valides à la liste" }));
    expect(screen.getByText("2 adresse(s) valide(s) · 1 doublon(s) · 0 entrée(s) invalide(s)")).toBeInTheDocument();
    fireEvent.click(prepare());
    await waitFor(() => expect(prepareRecipients).toHaveBeenCalledWith(["a@example.test", "b@example.test"]));
    expect(parseFile).toHaveBeenCalledWith(file);
  });
  it("retains typed addresses after file failure and allows a retry", async () => {
    parseFile.mockRejectedValue(new Error("Fichier illisible."));
    setup(); chooseList();
    fireEvent.change(screen.getByLabelText("Adresses e-mail des destinataires"), { target: { value: "keep@example.test" } });
    const input = screen.getByLabelText("Importer un fichier CSV, XLS ou XLSX");
    const file = new File(["bad"], "contacts.xls");
    fireEvent.change(input, { target: { files: [file] } });
    await screen.findByText("Fichier illisible.");
    expect(screen.getByLabelText("Adresses e-mail des destinataires")).toHaveValue("keep@example.test");
    expect(input).toHaveValue("");
    expect(prepare()).toBeEnabled();
  });
  it("does not prepare empty lists or more than 500 distinct addresses", () => {
    setup(); chooseList();
    expect(prepare()).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Adresses e-mail des destinataires"), { target: { value: Array.from({ length: 501 }, (_, i) => `email-${i}@example.test`).join("\n") } });
    expect(prepare()).toBeDisabled();
    expect(prepareRecipients).not.toHaveBeenCalled();
  });
});
