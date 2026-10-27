import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import MarketingOutputControls from "@/components/dashboard/marketing-print/MarketingOutputControls";

vi.mock("@/lib/ai/aiCreationJobs", () => ({
  getAiCreationRecords: () => [], getAiCreationImageUrl: vi.fn(), subscribeAiCreationRecords: () => () => {},
}));
vi.mock("@/lib/marketing/imageOutput", () => ({ downloadMarketingOutput: vi.fn() }));
vi.mock("@/lib/print/client", () => ({ getPrintGenerationCatalog: vi.fn() }));
afterEach(cleanup);
it("keeps the current format visible and advanced choices behind a disclosure", () => {
  const client = new QueryClient();
  render(<QueryClientProvider client={client}><MarketingOutputControls printEnabled={false} /></QueryClientProvider>);
  const summary = screen.getByText("Modifier la destination ou le format");
  const disclosure = summary.closest("details")!;
  expect(disclosure).not.toHaveAttribute("open");
  expect(screen.getByText("Format du visuel")).toBeVisible();
  expect(screen.getByText("Le téléchargement sera disponible après la génération d’un visuel.")).toBeVisible();
  fireEvent.click(summary);
  expect(disclosure).toHaveAttribute("open");
  const format = screen.getByLabelText("Format final exact") as HTMLSelectElement;
  expect(format.options.length).toBeGreaterThan(1);
  fireEvent.change(format, { target: { value: format.options[1].value } });
  expect(format.value).toBe(format.options[1].value);
  expect(screen.getByRole("button", { name: /Télécharger/ })).toBeDisabled();
  client.clear();
});
