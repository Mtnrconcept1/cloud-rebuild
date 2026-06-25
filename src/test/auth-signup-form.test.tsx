import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { act } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import Auth from "@/pages/Auth";

class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;

const supabaseMocks = vi.hoisted(() => ({
  resend: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  rpc: vi.fn(),
  signInWithOAuth: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  signUp: vi.fn(),
  upload: vi.fn(),
  invoke: vi.fn(),
  from: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  getSupabase: () => ({
    auth: {
      resend: supabaseMocks.resend,
      exchangeCodeForSession: supabaseMocks.exchangeCodeForSession,
      resetPasswordForEmail: supabaseMocks.resetPasswordForEmail,
      signInWithOAuth: supabaseMocks.signInWithOAuth,
      signInWithPassword: supabaseMocks.signInWithPassword,
      signOut: supabaseMocks.signOut,
      signUp: supabaseMocks.signUp,
    },
    from: supabaseMocks.from,
    rpc: supabaseMocks.rpc,
    functions: {
      invoke: supabaseMocks.invoke,
    },
    storage: {
      from: () => ({
        upload: supabaseMocks.upload,
      }),
    },
  }),
}));

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    roles: [],
    switchRole: vi.fn(),
    user: null,
  }),
}));

const toastMock = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({
    toast: toastMock,
  }),
}));

vi.mock("@/components/AddressAutocomplete", () => ({
  default: ({
    id,
    value,
    onValueChange,
    placeholder,
  }: {
    id: string;
    value: string;
    onValueChange: (value: string) => void;
    placeholder?: string;
  }) => (
    <input
      id={id}
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
      placeholder={placeholder}
    />
  ),
}));

vi.mock("@/components/CityAutocomplete", () => ({
  default: ({
    id,
    value,
    onValueChange,
    placeholder,
  }: {
    id: string;
    value: string;
    onValueChange: (value: string) => void;
    placeholder?: string;
  }) => (
    <input
      id={id}
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
      placeholder={placeholder}
    />
  ),
}));

const launchPackRows = [
  {
    id: "launch-pack-id",
    name: "Pack Starter",
    description: "Pack de test",
    price_chf: 490,
  },
];

const restaurantSubscriptionPlanRows = [
  {
    id: "restaurant-plan-id",
    slug: "starter",
    name: "TOK Starter",
    description: "Plan restaurateur de test",
    price_monthly_chf: 69,
    campaign_credit_chf: 25,
    ai_tool_credits: 80,
    ai_photo_credits: 10,
    monthly_image_limit: 10,
    monthly_premium_image_limit: 2,
  },
];

function mockSupabaseTable(table: string) {
  const rows = table === "launch_packs"
    ? launchPackRows
    : table === "restaurant_subscription_plans"
      ? restaurantSubscriptionPlanRows
      : [];
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(() => Promise.resolve({ data: rows, error: null })),
  };
  return builder;
}

async function settleUi() {
  await act(async () => {
    await Promise.resolve();
  });
}

async function renderAuth(route: string) {
  const view = render(
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path="/auth" element={<Auth />} />
        </Routes>
      </MemoryRouter>,
    );
  await settleUi();
  return view;
}


function signRestaurantContract() {
  fireEvent.change(screen.getByLabelText("Nom et fonction du signataire habilité"), {
    target: { value: "Marie Dupont, gérante" },
  });
  const signaturePad = screen.getByLabelText("Zone de signature manuscrite du contrat restaurateur");
  fireEvent.pointerDown(signaturePad, { clientX: 10, clientY: 10, pointerId: 1 });
  fireEvent.pointerMove(signaturePad, { clientX: 80, clientY: 30, pointerId: 1 });
  fireEvent.pointerUp(signaturePad, { pointerId: 1 });
}

function acceptLegalTerms() {
  fireEvent.click(screen.getByLabelText(/J'accepte les CGU/i));
}

describe("Auth signup form", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabaseMocks.resend.mockResolvedValue({ error: null });
    supabaseMocks.exchangeCodeForSession.mockResolvedValue({ data: { session: null }, error: null });
    supabaseMocks.from.mockImplementation(mockSupabaseTable);
    supabaseMocks.rpc.mockResolvedValue({ data: null, error: null });
    supabaseMocks.signOut.mockResolvedValue({ error: null });
    supabaseMocks.upload.mockResolvedValue({
      data: { path: "doc.pdf" },
      error: null,
    });
    supabaseMocks.invoke.mockResolvedValue({ data: { ok: true }, error: null });
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
      beginPath: vi.fn(),
      clearRect: vi.fn(),
      lineTo: vi.fn(),
      moveTo: vi.fn(),
      stroke: vi.fn(),
    })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.toDataURL = vi.fn(() => "data:image/png;base64,manual-signature");
    HTMLCanvasElement.prototype.setPointerCapture = vi.fn();
    supabaseMocks.signUp.mockResolvedValue({
      data: {
        session: null,
        user: { id: "new-user-id" },
      },
      error: null,
    });
    supabaseMocks.signInWithPassword.mockResolvedValue({
      data: {
        session: null,
        user: null,
      },
      error: new Error("Email not confirmed"),
    });
  });

  it("lets a client enter an email when switching to signup", async () => {
    await renderAuth("/auth?type=client");

    fireEvent.click(screen.getByRole("button", { name: "Pas encore de compte ? S'inscrire" }));

    const emailInput = screen.getByLabelText("Email");
    fireEvent.change(emailInput, { target: { value: "client@example.com" } });

    expect(emailInput).toHaveAttribute("type", "email");
    expect(emailInput).toHaveValue("client@example.com");
  });

  it("lets sign in users reveal and hide the password before submitting", async () => {
    await renderAuth("/auth?type=client");

    const passwordInput = screen.getByLabelText("Mot de passe");
    expect(passwordInput).toHaveAttribute("type", "password");

    fireEvent.click(screen.getByRole("button", { name: "Afficher le mot de passe" }));
    expect(passwordInput).toHaveAttribute("type", "text");

    fireEvent.click(screen.getByRole("button", { name: "Masquer le mot de passe" }));
    expect(passwordInput).toHaveAttribute("type", "password");
    expect(supabaseMocks.signInWithPassword).not.toHaveBeenCalled();
  });

  it("starts Google OAuth through the PKCE callback URL", async () => {
    supabaseMocks.signInWithOAuth.mockResolvedValue({ error: null });
    await renderAuth("/auth?type=client");

    fireEvent.click(screen.getByRole("button", { name: "Continuer avec Google" }));

    await waitFor(() => {
      expect(supabaseMocks.signInWithOAuth).toHaveBeenCalledWith({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
    });
  });

  it("lets signup users reveal and hide the password before submitting", async () => {
    await renderAuth("/auth?type=client");

    fireEvent.click(screen.getByRole("button", { name: "Pas encore de compte ? S'inscrire" }));

    const passwordInput = screen.getByLabelText("Mot de passe");
    expect(passwordInput).toHaveAttribute("type", "password");

    fireEvent.click(screen.getByRole("button", { name: "Afficher le mot de passe" }));
    expect(passwordInput).toHaveAttribute("type", "text");

    fireEvent.click(screen.getByRole("button", { name: "Masquer le mot de passe" }));
    expect(passwordInput).toHaveAttribute("type", "password");
    expect(supabaseMocks.signUp).not.toHaveBeenCalled();
  });

  it("submits client signup with the confirmation redirect and does not auto-login without a session", async () => {
    await renderAuth("/auth?type=client");

    fireEvent.click(screen.getByRole("button", { name: "Pas encore de compte ? S'inscrire" }));
    fireEvent.change(screen.getByLabelText("Nom complet"), { target: { value: "Client Test" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "client@example.com" } });
    fireEvent.change(screen.getByLabelText("Mot de passe"), {
      target: { value: "secret123" },
    });
    acceptLegalTerms();
    fireEvent.click(screen.getByRole("button", { name: "Créer mon compte" }));

    await waitFor(() => {
      expect(supabaseMocks.signUp).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "client@example.com",
          password: "secret123",
          options: expect.objectContaining({
            data: expect.objectContaining({
              legal_terms_accepted: true,
              privacy_policy_accepted: true,
            }),
            emailRedirectTo: `${window.location.origin}/auth?confirmed=1`,
          }),
        }),
      );
    });

    expect(supabaseMocks.signInWithPassword).not.toHaveBeenCalled();
    expect(toastMock).toHaveBeenCalledWith({
      title: "Compte créé",
      description: "Compte créé. Vérifiez votre email pour confirmer votre compte.",
    });
  });

  it("requires legal acceptance before creating a signup account", async () => {
    await renderAuth("/auth?type=client");

    fireEvent.click(screen.getByRole("button", { name: "Pas encore de compte ? S'inscrire" }));
    fireEvent.change(screen.getByLabelText("Nom complet"), { target: { value: "Client Test" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "client@example.com" } });
    fireEvent.change(screen.getByLabelText("Mot de passe"), {
      target: { value: "secret123" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Créer mon compte" }));

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Erreur",
          description: "Vous devez accepter les CGU et la politique de confidentialité.",
          variant: "destructive",
        }),
      );
    });
    expect(supabaseMocks.signUp).not.toHaveBeenCalled();
  });

  it("logs out a restaurateur signup session after submitting the verification dossier", async () => {
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
      beginPath: vi.fn(),
      clearRect: vi.fn(),
      lineTo: vi.fn(),
      moveTo: vi.fn(),
      stroke: vi.fn(),
    })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.toDataURL = vi.fn(() => "data:image/png;base64,manual-signature");
    HTMLCanvasElement.prototype.setPointerCapture = vi.fn();
    supabaseMocks.signUp.mockResolvedValue({
      data: {
        session: { access_token: "signup-session" },
        user: { id: "restaurant-user-id" },
      },
      error: null,
    });

    const { container } = await renderAuth("/auth?type=restaurateur");
    await screen.findByText("TOK Starter");
    await screen.findByText("TOK Starter");

    fireEvent.change(screen.getByLabelText("Nom du responsable"), {
      target: { value: "Restaurateur Test" },
    });
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "restaurant@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Mot de passe"), {
      target: { value: "secret123" },
    });
    fireEvent.change(screen.getByLabelText("Téléphone"), {
      target: { value: "+41790000000" },
    });
    fireEvent.change(screen.getByLabelText("Ville"), {
      target: { value: "Genève" },
    });
    fireEvent.change(screen.getByLabelText("Adresse"), {
      target: { value: "Rue du Rhône 1" },
    });
    fireEvent.change(screen.getByLabelText("Nom commercial"), {
      target: { value: "Table Tok" },
    });
    fireEvent.change(screen.getByLabelText("Raison sociale"), {
      target: { value: "Table Tok Sàrl" },
    });
    fireEvent.change(screen.getByLabelText("Numéro d'immatriculation"), {
      target: { value: "CHE-123.456.789" },
    });
    fireEvent.change(screen.getByLabelText("Nom du restaurant"), {
      target: { value: "La Table Tok" },
    });
    fireEvent.change(screen.getByLabelText("IBAN de versement"), {
      target: { value: "CH9300762011623852957" },
    });
    acceptLegalTerms();
    signRestaurantContract();

    const documentFile = new File(["document"], "document.pdf", {
      type: "application/pdf",
    });
    const fileInputs = Array.from(
      container.querySelectorAll<HTMLInputElement>('input[type="file"]'),
    );
    expect(fileInputs).toHaveLength(3);
    for (const input of fileInputs) {
      fireEvent.change(input, { target: { files: [documentFile] } });
    }

    fireEvent.click(
      screen.getByRole("button", { name: "Envoyer mon inscription vérifiée" }),
    );

    await waitFor(() => {
      expect(supabaseMocks.rpc).toHaveBeenCalledWith(
        "sync_signup_application",
        expect.objectContaining({
          p_requested_role: "restaurateur",
          p_restaurant_name: "La Table Tok",
          p_metadata: expect.objectContaining({
            selected_subscription_plan_id: "restaurant-plan-id",
            selected_subscription_billing_period: "monthly",
            onboarding_payment_status: "pending_payment",
            legal_terms_accepted: true,
            privacy_policy_accepted: true,
            contract_version: "TOK-CH-RP-2026-06-v2",
            contract_signer_name: "Marie Dupont, gérante",
            contract_signature_data_url: expect.stringContaining("data:image/png;base64,"),
            contract_content_sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
            contract_content_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
            contract_acceptance_text: expect.stringContaining("je déclare être habilité"),
            contract_signed_email: "restaurant@example.com",
            contract_signed_user_id: "restaurant-user-id",
            contract_legal_name: "Table Tok Sàrl",
            contract_business_name: "Table Tok",
            contract_restaurant_name: "La Table Tok",
          }),
        }),
      );
    });

    expect(supabaseMocks.signOut).toHaveBeenCalledTimes(1);
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Inscription enregistrée",
        description: expect.stringContaining("après validation"),
      }),
    );
  });


  it("submits the complete restaurateur dossier through the Edge Function when email confirmation prevents a session", async () => {
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
      beginPath: vi.fn(),
      clearRect: vi.fn(),
      lineTo: vi.fn(),
      moveTo: vi.fn(),
      stroke: vi.fn(),
    })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.toDataURL = vi.fn(() => "data:image/png;base64,manual-signature");
    HTMLCanvasElement.prototype.setPointerCapture = vi.fn();
    supabaseMocks.signUp.mockResolvedValue({
      data: {
        session: null,
        user: { id: "restaurant-user-id" },
      },
      error: null,
    });

    const { container } = await renderAuth("/auth?type=restaurateur");
    await screen.findByText("TOK Starter");
    await screen.findByText("TOK Starter");

    fireEvent.change(screen.getByLabelText("Nom du responsable"), {
      target: { value: "Restaurateur Test" },
    });
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "restaurant@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Mot de passe"), {
      target: { value: "secret123" },
    });
    fireEvent.change(screen.getByLabelText("Téléphone"), {
      target: { value: "+41790000000" },
    });
    fireEvent.change(screen.getByLabelText("Ville"), {
      target: { value: "Genève" },
    });
    fireEvent.change(screen.getByLabelText("Adresse"), {
      target: { value: "Rue du Rhône 1" },
    });
    fireEvent.change(screen.getByLabelText("Nom commercial"), {
      target: { value: "Table Tok" },
    });
    fireEvent.change(screen.getByLabelText("Raison sociale"), {
      target: { value: "Table Tok Sàrl" },
    });
    fireEvent.change(screen.getByLabelText("Numéro d'immatriculation"), {
      target: { value: "CHE-123.456.789" },
    });
    fireEvent.change(screen.getByLabelText("Nom du restaurant"), {
      target: { value: "La Table Tok" },
    });
    fireEvent.change(screen.getByLabelText("IBAN de versement"), {
      target: { value: "CH9300762011623852957" },
    });
    acceptLegalTerms();
    signRestaurantContract();

    const documentFile = new File(["document"], "document.png", {
      type: "image/png",
    });
    const fileInputs = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="file"]'));
    expect(fileInputs).toHaveLength(3);
    for (const input of fileInputs) {
      fireEvent.change(input, { target: { files: [documentFile] } });
    }

    fireEvent.click(screen.getByRole("button", { name: "Envoyer mon inscription vérifiée" }));

    await waitFor(() => {
      expect(supabaseMocks.invoke).toHaveBeenCalledWith(
        "submit-signup-application",
        expect.objectContaining({ body: expect.any(FormData) }),
      );
    });

    const body = supabaseMocks.invoke.mock.calls[0][1].body as FormData;
    expect(body.get("user_id")).toBe("restaurant-user-id");
    expect(body.get("requested_role")).toBe("restaurateur");
    expect(body.get("restaurant_name")).toBe("La Table Tok");
    expect(body.get("launch_pack_id")).toBeNull();
    expect(body.get("subscription_plan_id")).toBe("restaurant-plan-id");
    expect(body.get("subscription_billing_period")).toBe("monthly");
    expect(body.get("terms_accepted")).toBe("true");
    expect(body.get("privacy_policy_accepted")).toBe("true");
    expect(body.get("contract_version")).toBe("TOK-CH-RP-2026-06-v2");
    expect(body.get("contract_signer_name")).toBe("Marie Dupont, gérante");
    expect(String(body.get("contract_signature_data_url"))).toContain("data:image/png;base64,");
    expect(body.get("document_identity_document")).toBeInstanceOf(File);
    expect(body.get("document_business_registration")).toBeInstanceOf(File);
    expect(body.get("document_iban_proof")).toBeInstanceOf(File);
    expect(supabaseMocks.rpc).not.toHaveBeenCalledWith("sync_signup_application", expect.anything());
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Inscription enregistrée",
        description: expect.stringContaining("après confirmation"),
      }),
    );
  });

  it("lets users resend the signup confirmation email", async () => {
    await renderAuth("/auth?type=client");

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "client@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Renvoyer l’email de confirmation" }));

    await waitFor(() => {
      expect(supabaseMocks.resend).toHaveBeenCalledWith({
        type: "signup",
        email: "client@example.com",
        options: {
          emailRedirectTo: `${window.location.origin}/auth?confirmed=1`,
        },
      });
    });
  });

  it("keeps the restaurateur signup email field editable", async () => {
    await renderAuth("/auth?type=restaurateur");
    await screen.findByText("TOK Starter");

    const emailInput = screen.getByLabelText("Email");
    fireEvent.change(emailInput, { target: { value: "restaurant@example.com" } });

    expect(screen.getByRole("heading", { name: "Créer un compte vérifié" })).toBeInTheDocument();
    expect(emailInput).toHaveAttribute("type", "email");
    expect(emailInput).toHaveValue("restaurant@example.com");
  });
});
