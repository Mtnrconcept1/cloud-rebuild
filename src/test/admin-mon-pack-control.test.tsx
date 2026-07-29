import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

type MockFeatureFlag = {
  id: string;
  name: string;
  label: string;
  description: string;
  explicitEnabled: boolean;
  effectiveEnabled: boolean;
  blockedBy: string[];
};

const setFlagStateMock = vi.hoisted(() => vi.fn());
const toastMock = vi.hoisted(() => vi.fn());
const moduleQueryResult = vi.hoisted(() => ({ count: 0, error: null }));
const moduleQueryBuilder = vi.hoisted(() => {
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
  };
  builder.select.mockReturnValue(builder);
  builder.eq.mockResolvedValue(moduleQueryResult);
  builder.in.mockResolvedValue(moduleQueryResult);
  return builder;
});
const supabaseFromMock = vi.hoisted(() => vi.fn(() => moduleQueryBuilder));
const featureState = vi.hoisted(() => ({
  flags: [] as MockFeatureFlag[],
  loading: false,
}));

vi.mock("@/lib/featureFlags", () => ({
  useFeatureFlags: () => ({
    flags: featureState.flags,
    loading: featureState.loading,
    setFlagState: setFlagStateMock,
  }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  getSupabase: () => ({ from: supabaseFromMock }),
}));

import AdminMonPackControl from "@/components/admin/AdminMonPackControl";

const enabledFlag = {
  id: "84d1b334-055d-40cf-ac3b-a0228a6d26f0",
  name: "dashboard-pack",
  label: "Mon pack — coupure globale",
  description: "Contrôle global",
  explicitEnabled: true,
  effectiveEnabled: true,
  blockedBy: [],
};

function renderControl() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(<AdminMonPackControl />, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
}

describe("AdminMonPackControl", () => {
  beforeEach(() => {
    featureState.loading = false;
    featureState.flags = [{ ...enabledFlag }];
    setFlagStateMock.mockReset();
    setFlagStateMock.mockResolvedValue({ success: true });
    toastMock.mockReset();
    supabaseFromMock.mockClear();
    moduleQueryBuilder.select.mockClear();
    moduleQueryBuilder.eq.mockClear();
    moduleQueryBuilder.in.mockClear();
  });

  it("requires a visible reason and writes the explicit disabled state", async () => {
    renderControl();

    const toggle = screen.getByRole("switch", {
      name: "Activer ou désactiver Mon pack globalement",
    });
    expect(toggle).toBeChecked();

    fireEvent.click(toggle);

    const dialog = await screen.findByRole("alertdialog");
    const confirm = within(dialog).getByRole("button", {
      name: "Confirmer la coupure",
    });
    const reason = within(dialog).getByLabelText(/motif du changement/i);

    expect(confirm).toBeDisabled();
    expect(reason).toHaveAttribute("required");
    expect(reason).toHaveAttribute("aria-required", "true");

    fireEvent.change(reason, {
      target: { value: "Maintenance Fair Growth planifiée" },
    });
    fireEvent.click(confirm);

    await waitFor(() => {
      expect(setFlagStateMock).toHaveBeenCalledWith(
        enabledFlag.id,
        false,
        "Maintenance Fair Growth planifiée",
      );
    });
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({
      title: "Mon pack désactivé",
    }));
  });

  it("keeps the dialog and reason available when the RPC fails", async () => {
    setFlagStateMock.mockResolvedValueOnce({
      success: false,
      error: "Accès refusé",
    });
    renderControl();

    fireEvent.click(screen.getByRole("switch"));
    const dialog = await screen.findByRole("alertdialog");
    const reason = within(dialog).getByLabelText(/motif du changement/i);
    fireEvent.change(reason, { target: { value: "Test erreur" } });
    fireEvent.click(within(dialog).getByRole("button", {
      name: "Confirmer la coupure",
    }));

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({
        title: "Modification impossible",
        description: "Accès refusé",
        variant: "destructive",
      }));
    });
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByLabelText(/motif du changement/i)).toHaveValue("Test erreur");
  });

  it("recovers the confirmation controls when the request rejects", async () => {
    setFlagStateMock.mockRejectedValueOnce(new Error("Réseau indisponible"));
    renderControl();

    fireEvent.click(screen.getByRole("switch"));
    const dialog = await screen.findByRole("alertdialog");
    const reason = within(dialog).getByLabelText(/motif du changement/i);
    const confirm = within(dialog).getByRole("button", {
      name: "Confirmer la coupure",
    });
    fireEvent.change(reason, { target: { value: "Test rejet" } });
    fireEvent.click(confirm);

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({
        title: "Modification impossible",
        description: "Réseau indisponible",
        variant: "destructive",
      }));
    });
    await waitFor(() => {
      expect(confirm).toBeEnabled();
    });
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(reason).toHaveValue("Test rejet");
  });

  it("writes the explicit enabled state without claiming dependencies are active", async () => {
    featureState.flags = [{
      ...enabledFlag,
      explicitEnabled: false,
      effectiveEnabled: false,
      blockedBy: ["dashboard-pack"],
    }];
    renderControl();

    expect(screen.getByRole("switch")).not.toBeChecked();
    fireEvent.click(screen.getByRole("switch"));

    const dialog = await screen.findByRole("alertdialog");
    fireEvent.change(within(dialog).getByLabelText(/motif du changement/i), {
      target: { value: "Fin de maintenance" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Réactiver" }));

    await waitFor(() => {
      expect(setFlagStateMock).toHaveBeenCalledWith(
        enabledFlag.id,
        true,
        "Fin de maintenance",
      );
    });
    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({
        title: "Mon pack réactivé",
        description: expect.stringContaining("Les dépendances globales du dashboard restent appliquées"),
      }));
    });
  });

  it("fails closed while the authoritative server state is loading or unavailable", () => {
    featureState.loading = true;
    featureState.flags = [{
      ...enabledFlag,
      id: "dashboard-pack",
      explicitEnabled: false,
      effectiveEnabled: false,
    }];
    const view = renderControl();

    expect(screen.getByText("Chargement")).toBeInTheDocument();
    expect(screen.getByRole("switch")).toBeDisabled();

    featureState.loading = false;
    view.rerender(<AdminMonPackControl />);

    expect(screen.getByText("Indisponible")).toBeInTheDocument();
    expect(screen.getByRole("switch")).toBeDisabled();
    expect(screen.getByText(/mutation à l'aveugle/i)).toBeInTheDocument();
  });
});
