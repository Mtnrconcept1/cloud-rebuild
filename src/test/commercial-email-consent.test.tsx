import { fireEvent, render, screen, waitFor, cleanup, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CommercialEmailConsentDialog from "@/components/commercial/CommercialEmailConsentDialog";
import { validateConsentFields, consentErrorMessage } from "@/lib/commercialEmailConsent";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), toast: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ getSupabase: () => ({ rpc: mocks.rpc }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/components/workforce/WorkforceSignaturePad", () => ({ default: ({ onChange, disabled }: {onChange: (s: string | null) => void; disabled?: boolean}) => <button disabled={disabled} type="button" onClick={() => onChange("data:image/png;base64,iVBORw0KGgo" + "A".repeat(220))}>Tracer la signature de test</button> }));
const document = { version: "tok-b2b-presence-v2", controller: "Exploitant de test", address: "Rue de test 1, Genève", contact: "test@example.com", text: "J’autorise uniquement les e-mails commerciaux TOK. Aucun abonnement.", privacy: "Preuve de consentement conservée en privé." };
const context = { document, document_hash: "a".repeat(64), is_admin: false, latest: null };
const receipt = { receipt_id: "00000000-0000-4000-8000-000000000001", source_objectid: 1, restaurant_name: "Restaurant A", email: "gerant@example.com", signer_name: "Personne de test", signer_role: "Gérant", signed_at: "2026-10-27T19:00:00Z", document, document_hash: "a".repeat(64), signature_data: "data:image/png;base64,iVBORw0KGgo" + "A".repeat(220), proof_hash: "b".repeat(64), approval_method: "restaurateur_signature_in_person", email_verified: false, email_eligible: true, withdrawn: false, evidence_quality: "system_event" };
const prospect = { sourceObjectId: 1, name: "Restaurant A", email: "annuaire@example.com" };
const fields = { email: "gerant@example.com", emailAgain: "gerant@example.com", signerName: "Personne de test", signerRole: "Gérant", signature: receipt.signature_data, consented: true };
const fill = async () => {
 await screen.findByLabelText("E-mail professionnel");
 fireEvent.change(screen.getByLabelText("E-mail professionnel"), { target: { value: fields.email } });
 fireEvent.change(screen.getByLabelText("Confirmez l’e-mail"), { target: { value: fields.emailAgain } });
 fireEvent.change(screen.getByLabelText("Votre prénom et nom"), { target: { value: fields.signerName } });
 fireEvent.change(screen.getByLabelText("Votre fonction"), { target: { value: fields.signerRole } });
 fireEvent.click(screen.getByRole("checkbox"));
 fireEvent.click(screen.getByText("Tracer la signature de test"));
};
beforeEach(() => {
  // jsdom does not implement layout observation; retain the real Radix checkbox.
  vi.stubGlobal("ResizeObserver", class {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  });
  mocks.rpc.mockReset(); mocks.toast.mockReset(); mocks.rpc.mockImplementation(async (name: string) => ({ data: name === "commercial_get_email_consent_context" ? context : receipt, error: null })); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("consentement personnel du restaurateur", () => {
 it("exige un accord positif, des coordonnées concordantes et une signature", () => {
  expect(validateConsentFields(fields)).toBeNull();
  expect(validateConsentFields({ ...fields, consented: false })).toMatch(/accord/);
  expect(validateConsentFields({ ...fields, signature: null })).toMatch(/signature/);
  expect(validateConsentFields({ ...fields, emailAgain: "autre@example.com" })).toMatch(/identiques/);
  expect(validateConsentFields({ ...fields, signerName: " " })).toMatch(/nom/);
  expect(validateConsentFields({ ...fields, email: "x@-bad.ch", emailAgain: "x@-bad.ch" })).toMatch(/valide/);
 });
 it("traduit les erreurs PostgREST sans afficher les détails SQL", () => {
  expect(consentErrorMessage({ message: "consent_document_changed", details: "sensitive sql" })).toMatch(/texte/);
  expect(consentErrorMessage({ message: "contact_suppressed_reconsent_requires_independent_verification" })).toMatch(/opposition/);
  expect(consentErrorMessage({ message: "raw database secret", details: "secret" })).not.toContain("secret");
 });
 it("préremplit l’adresse de la fiche sans accord ni signature automatique", async () => {
  render(<CommercialEmailConsentDialog open onOpenChange={vi.fn()} prospect={prospect} />);
  expect(await screen.findByLabelText("E-mail professionnel")).toHaveValue(prospect.email);
  expect(screen.getByLabelText("Confirmez l’e-mail")).toHaveValue(prospect.email);
  expect(screen.getByRole("checkbox")).not.toBeChecked();
  expect(screen.getByRole("button", { name: "J’approuve et je signe mon consentement" })).toBeDisabled();
  expect(mocks.rpc.mock.calls.filter(c => c[0] === "commercial_record_signed_email_consent_v2")).toHaveLength(0);
 });

 it("sépare l’autorisation préremplie, l’e-mail et la signature du restaurateur", async () => {
  render(<CommercialEmailConsentDialog open onOpenChange={vi.fn()} prospect={{ ...prospect, address: "Rue de test 5", postalCode: "1200", locality: "Genève" }} />);
  const authorization = await screen.findByRole("region", { name: "Autorisation préremplie" });
  expect(within(authorization).getByText(prospect.name)).toBeInTheDocument();
  expect(within(authorization).getByText("Rue de test 5, 1200 Genève")).toBeInTheDocument();
  expect(within(authorization).getByText(document.text)).toBeInTheDocument();
  expect(within(screen.getByRole("region", { name: "E-mail du restaurateur" })).getByLabelText("E-mail professionnel")).toHaveValue(prospect.email);
  const signature = screen.getByRole("region", { name: "Signature du restaurateur" });
  expect(within(signature).getByText("Tracer la signature de test")).toBeInTheDocument();
  expect(within(signature).getByLabelText("Votre prénom et nom")).toHaveValue("");
  expect(within(signature).getByLabelText("Votre fonction")).toHaveValue("");
 });
 it.each([undefined, null, "", "   ", "pas-un-email", "x@-invalid.ch"])("permet une saisie manuelle si la fiche ne contient pas d’adresse valide : %s", async email => {
  render(<CommercialEmailConsentDialog open onOpenChange={vi.fn()} prospect={{ ...prospect, email }} />);
  expect(await screen.findByLabelText("E-mail professionnel")).toHaveValue("");
  expect(screen.getByLabelText("Confirmez l’e-mail")).toHaveValue("");
  expect(screen.getByText(/saisir manuellement/i)).toBeInTheDocument();
  await fill();
  fireEvent.click(screen.getByRole("button", { name: "J’approuve et je signe mon consentement" }));
  await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("commercial_record_signed_email_consent_v2", expect.objectContaining({ p_email: fields.email })));
 });
 it("normalise l’adresse existante sans inventer le signataire", async () => {
  render(<CommercialEmailConsentDialog open onOpenChange={vi.fn()} prospect={{ ...prospect, email: "  CONTACT@EXAMPLE.COM  " }} />);
  expect(await screen.findByLabelText("E-mail professionnel")).toHaveValue("contact@example.com");
  expect(screen.getByLabelText("Confirmez l’e-mail")).toHaveValue("contact@example.com");
  expect(screen.getByLabelText("Votre prénom et nom")).toHaveValue("");
  expect(screen.getByLabelText("Votre fonction")).toHaveValue("");
 });
 it("enregistre l’adresse de la fiche sans exiger une nouvelle saisie", async () => {
  render(<CommercialEmailConsentDialog open onOpenChange={vi.fn()} prospect={prospect} />);
  fireEvent.change(await screen.findByLabelText("Votre prénom et nom"), { target: { value: fields.signerName } });
  fireEvent.change(screen.getByLabelText("Votre fonction"), { target: { value: fields.signerRole } });
  fireEvent.click(screen.getByRole("checkbox"));
  expect(screen.getByRole("button", { name: "J’approuve et je signe mon consentement" })).toBeDisabled();
  fireEvent.click(screen.getByText("Tracer la signature de test"));
  fireEvent.click(screen.getByRole("button", { name: "J’approuve et je signe mon consentement" }));
  await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("commercial_record_signed_email_consent_v2", expect.objectContaining({ p_email: prospect.email, p_explicit_consent: true })));
 });
 it("une correction d’e-mail efface l’accord et exige une nouvelle signature", async () => {
  render(<CommercialEmailConsentDialog open onOpenChange={vi.fn()} prospect={prospect} />); await fill();
  fireEvent.change(screen.getByLabelText("E-mail professionnel"), { target: { value: "corrige@example.com" } });
  expect(screen.getByRole("checkbox")).not.toBeChecked();
  fireEvent.change(screen.getByLabelText("Confirmez l’e-mail"), { target: { value: "corrige@example.com" } });
  fireEvent.click(screen.getByRole("checkbox"));
  expect(screen.getByRole("button", { name: "J’approuve et je signe mon consentement" })).toBeDisabled();
  fireEvent.click(screen.getByText("Tracer la signature de test"));
  fireEvent.click(screen.getByRole("button", { name: "J’approuve et je signe mon consentement" }));
  await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("commercial_record_signed_email_consent_v2", expect.objectContaining({ p_email: "corrige@example.com" })));
 });
 it("ne remplace pas une saisie manuelle lors d’une actualisation de la même fiche", async () => {
  const { rerender } = render(<CommercialEmailConsentDialog open onOpenChange={vi.fn()} prospect={prospect} />); await fill();
  rerender(<CommercialEmailConsentDialog open onOpenChange={vi.fn()} prospect={{ ...prospect, email: "actualise@example.com" }} />);
  expect(screen.getByLabelText("E-mail professionnel")).toHaveValue(fields.email);
  expect(screen.getByLabelText("Confirmez l’e-mail")).toHaveValue(fields.emailAgain);
 });
 it("utilise l’adresse du nouveau restaurant et aucune approbation du précédent", async () => {
  const { rerender } = render(<CommercialEmailConsentDialog open onOpenChange={vi.fn()} prospect={prospect} />); await fill();
  rerender(<CommercialEmailConsentDialog open onOpenChange={vi.fn()} prospect={{ sourceObjectId: 2, name: "Restaurant B", email: "b@example.com" }} />);
  expect(await screen.findByLabelText("E-mail professionnel")).toHaveValue("b@example.com");
  expect(screen.getByLabelText("Confirmez l’e-mail")).toHaveValue("b@example.com");
  expect(screen.getByLabelText("Votre prénom et nom")).toHaveValue("");
  expect(screen.getByRole("checkbox")).not.toBeChecked();
  expect(screen.getByRole("button", { name: "J’approuve et je signe mon consentement" })).toBeDisabled();
 });
 it("enregistre directement la signature du restaurateur comme consentement e-mail", async () => {
  render(<CommercialEmailConsentDialog open onOpenChange={vi.fn()} prospect={prospect} />); await fill();
  fireEvent.click(screen.getByRole("button", { name: "J’approuve et je signe mon consentement" }));
  await screen.findByText("Consentement enregistré dans Marketing TOK");
  const calls = mocks.rpc.mock.calls.filter(c => c[0] === "commercial_record_signed_email_consent_v2");
  expect(calls).toHaveLength(1);
  expect(calls[0][1]).toMatchObject({ p_source_objectid: 1, p_explicit_consent: true, p_email: fields.email, p_document_hash: context.document_hash });
  expect(calls[0][1].p_request_id).toMatch(/^[0-9a-f-]{36}$/);
  expect(screen.getByText(/Adresse e-mail non vérifiée/)).toBeInTheDocument();
 });
 it("efface accord et signature lorsque les coordonnées changent", async () => {
  render(<CommercialEmailConsentDialog open onOpenChange={vi.fn()} prospect={prospect} />); await fill();
  fireEvent.change(screen.getByLabelText("Votre prénom et nom"), { target: { value: "Autre personne" } });
  expect(screen.getByRole("checkbox")).not.toBeChecked();
  expect(screen.getByRole("button", { name: "J’approuve et je signe mon consentement" })).toBeDisabled();
 });
 it("ne conserve aucune signature ou case lors d’une fermeture ou d’un changement de prospect", async () => {
  const { rerender } = render(<CommercialEmailConsentDialog open onOpenChange={vi.fn()} prospect={prospect} />); await fill();
  rerender(<CommercialEmailConsentDialog open={false} onOpenChange={vi.fn()} prospect={prospect} />);
  rerender(<CommercialEmailConsentDialog open onOpenChange={vi.fn()} prospect={prospect} />);
  expect(await screen.findByLabelText("E-mail professionnel")).toHaveValue(prospect.email); expect(screen.getByRole("checkbox")).not.toBeChecked();
  await fill();
  rerender(<CommercialEmailConsentDialog open onOpenChange={vi.fn()} prospect={{ sourceObjectId: 2, name: "Restaurant B" }} />);
  expect(await screen.findByLabelText("E-mail professionnel")).toHaveValue(""); expect(screen.getByRole("checkbox")).not.toBeChecked();
 });
 it("bloque le double clic et conserve la clé de tentative lors d’une erreur réseau", async () => {
  let resolve: (value: unknown) => void = () => {};
  mocks.rpc.mockImplementation((name: string) => name === "commercial_get_email_consent_context" ? Promise.resolve({ data: context, error: null }) : new Promise(r => { resolve = r; }));
  render(<CommercialEmailConsentDialog open onOpenChange={vi.fn()} prospect={prospect} />); await fill();
  const button = screen.getByRole("button", { name: "J’approuve et je signe mon consentement" }); fireEvent.click(button); fireEvent.click(button);
  expect(mocks.rpc.mock.calls.filter(c => c[0] === "commercial_record_signed_email_consent_v2")).toHaveLength(1);
  const key = mocks.rpc.mock.calls.at(-1)?.[1].p_request_id;
  resolve({ data: null, error: { message: "network failure" } }); await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "J’approuve et je signe mon consentement" }));
  await waitFor(() => expect(mocks.rpc.mock.calls.filter(c => c[0] === "commercial_record_signed_email_consent_v2")).toHaveLength(2));
  expect(mocks.rpc.mock.calls.at(-1)?.[1].p_request_id).toBe(key);
  resolve({ data: receipt, error: null }); await screen.findByText("Consentement enregistré dans Marketing TOK");
 });
 it("bloque la collecte sans identité du responsable et ne crée pas de consentement", async () => {
  mocks.rpc.mockResolvedValue({ data: { ...context, document: null, document_hash: null }, error: null });
  render(<CommercialEmailConsentDialog open onOpenChange={vi.fn()} prospect={prospect} />);
  await screen.findByText(/identité professionnelle de TOK/); expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
 });
 it("permet à l’admin de configurer le responsable dans le dashboard, sans site tiers", async () => {
  mocks.rpc.mockImplementation(async (name: string) => ({ data: name === "commercial_get_email_consent_context" ? { ...context, is_admin: true, document: null, document_hash: null } : { ...context, is_admin: true }, error: null }));
  render(<CommercialEmailConsentDialog open onOpenChange={vi.fn()} prospect={prospect} />);
  fireEvent.change(await screen.findByLabelText("Nom ou raison sociale"), { target: { value: document.controller } });
  fireEvent.change(screen.getByLabelText("Adresse professionnelle"), { target: { value: document.address } });
  fireEvent.change(screen.getByLabelText("E-mail de contact et retrait"), { target: { value: document.contact } });
  fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(screen.getByRole("button", { name: "Enregistrer le responsable" }));
  await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("commercial_configure_email_consent_controller", expect.objectContaining({ p_controller: document.controller, p_explicit_confirmation: true })));
 });
});


describe("signature autorisante et confirmation complémentaire", () => {
 const pending = { ...receipt, email_eligible: true, confirmation_required: false, confirmation_state: "pending", confirmed_at: null, email_delivery_state: "queued" };
 it("affiche le consentement signé actif avant le clic de confirmation complémentaire", async () => {
   mocks.rpc.mockImplementation(async (name: string) => ({ data: name === "commercial_get_email_consent_context" ? context : pending, error: null }));
   render(<CommercialEmailConsentDialog open onOpenChange={vi.fn()} prospect={prospect} />); await fill();
   fireEvent.click(screen.getByRole("button", { name: "J’approuve et je signe mon consentement" }));
   await screen.findByText("Consentement signé actif — e-mail non confirmé");
   expect(screen.getByText(/file d’envoi/)).toBeInTheDocument();
   expect(screen.queryByText(/Adresse autorisée/)).not.toBeInTheDocument();
   expect(screen.getByText(/JE CONSENS/)).toBeInTheDocument();
   expect(mocks.rpc.mock.calls.some(c => c[0] === "commercial_consent_public_action")).toBe(false);
 });
 it("actualise la preuve après le clic en boîte mail, sans consentir à la place du restaurateur", async () => {
   mocks.rpc.mockImplementation(async (name: string) => ({ data: name === "commercial_get_email_consent_context" ? context : pending, error: null }));
   render(<CommercialEmailConsentDialog open onOpenChange={vi.fn()} prospect={prospect} />); await fill();
   fireEvent.click(screen.getByRole("button", { name: "J’approuve et je signe mon consentement" }));
   await screen.findByText("Consentement signé actif — e-mail non confirmé");
   mocks.rpc.mockResolvedValue({ data: { ...pending, confirmation_state: "confirmed", email_eligible: true, email_verified: true, confirmed_at: "2026-10-27T20:00:00Z", email_delivery_state: "sent" }, error: null });
   fireEvent.click(screen.getByRole("button", { name: "Actualiser la confirmation" }));
   await screen.findByText("Consentement signé et confirmé par e-mail");
   expect(screen.getByText(/Confirmation depuis la boîte/)).toBeInTheDocument();
   expect(mocks.rpc.mock.calls.at(-1)?.[0]).toBe("commercial_get_email_consent_receipt");
 });
 it("annonce l’échec d’envoi sans annuler le consentement signé", async () => {
   mocks.rpc.mockImplementation(async (name: string) => ({ data: name === "commercial_get_email_consent_context" ? context : { ...pending, email_delivery_state: "failed" }, error: null }));
   render(<CommercialEmailConsentDialog open onOpenChange={vi.fn()} prospect={prospect} />); await fill();
   fireEvent.click(screen.getByRole("button", { name: "J’approuve et je signe mon consentement" }));
   await screen.findByText(/Échec de l’envoi/);
   expect(screen.getByText("Consentement signé actif — e-mail non confirmé")).toBeInTheDocument();
 });
});
