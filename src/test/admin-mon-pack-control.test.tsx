import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const setFlagStateMock = vi.hoisted(() => vi.fn());
const toastMock = vi.hoisted(() => vi.fn());
const featureState = vi.hoisted(() => ({
  flags: [] as any[],
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

describe("AdminMonPackControl", () => {
  beforeEach(() => {
    featureState.loading = false;
    featureState.flags = [{ ...enabledFlag }];
    setFlagStateMock.mockReset();
    setFlagStateMock.mockResolvedValue({ success: true });
    toastMock.mockReset();
  });

  it("requires a visible reason and writes the explicit disabled state", async () => {
    render(<AdminMonPackControl />);

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
    expect(reason).toBeRequired();

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
    render(<AdminMonPackControl />);

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

  it("writes the explicit enabled state without claiming dependencies are active", async () => {
    featureState.flags = [{
      ...enabledFlag,
      explicitEnabled: false,
      effectiveEnabled: false,
      blockedBy: ["dashboard-pack"],
    }];
    render(<AdminMonPackControl />);

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
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({
      title: "Mon pack réactivé",
      description: expect.stringContaining("Les dépendances globales du dashboard restent appliquées"),
    }));
  });

  it("fails closed while the authoritative server state is loading or unavailable", () => {
    featureState.loading = true;
    featureState.flags = [{
      ...enabledFlag,
      id: "dashboard-pack",
      explicitEnabled: false,
      effectiveEnabled: false,
    }];
    const view = render(<AdminMonPackControl />);

    expect(screen.getByText("Chargement")).toBeInTheDocument();
    expect(screen.getByRole("switch")).toBeDisabled();

    featureState.loading = false;
    view.rerender(<AdminMonPackControl />);

    expect(screen.getByText("Indisponible")).toBeInTheDocument();
    expect(screen.getByRole("switch")).toBeDisabled();
    expect(screen.getByText(/mutation à l'aveugle/i)).toBeInTheDocument();
  });
});
