import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
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
 it("n’utilise ni adresse annuaire préremplie, ni case cochée", async () => {
  render(<CommercialEmailConsentDialog open onOpenChange={vi.fn()} prospect={prospect} />);
  expect(await screen.findByLabelText("E-mail professionnel")).toHaveValue("");
  expect(screen.getByRole("checkbox")).not.toBeChecked();
  expect(screen.getByRole("button", { name: "J’approuve et je signe mon consentement" })).toBeDisabled();
  expect(mocks.rpc.mock.calls.filter(c => c[0] === "commercial_record_signed_email_consent_v2")).toHaveLength(0);
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
  expect(await screen.findByLabelText("E-mail professionnel")).toHaveValue(""); expect(screen.getByRole("checkbox")).not.toBeChecked();
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
