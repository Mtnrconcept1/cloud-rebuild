import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Compass } from "lucide-react";
import { afterEach, describe, expect, it } from "vitest";

import WorkspaceNavigationSection from "@/components/dashboard/WorkspaceNavigationSection";

function Section({ active = false, collapsed = false }: { active?: boolean; collapsed?: boolean }) {
  return (
    <WorkspaceNavigationSection title="Mon restaurant" icon={Compass} active={active} collapsed={collapsed}>
      <a href="/dashboard/menu" aria-current={active ? "page" : undefined}>Menu</a>
      <a href="/dashboard/service">Pilotage de service</a>
    </WorkspaceNavigationSection>
  );
}

afterEach(cleanup);

describe("workspace navigation sections", () => {
  it("keeps inactive destinations hidden until the named control expands its own section", () => {
    render(<Section />);
    const toggle = screen.getByRole("button", { name: "Mon restaurant" });
    const controlledItems = document.getElementById(toggle.getAttribute("aria-controls")!);
    expect(toggle).toHaveAttribute("type", "button");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(controlledItems).not.toBeVisible();
    expect(screen.queryByRole("link", { name: "Menu" })).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(controlledItems).toBeVisible();
    expect(screen.getByRole("link", { name: "Menu" })).toHaveAttribute("href", "/dashboard/menu");
    expect(screen.getByRole("link", { name: "Pilotage de service" })).toHaveAttribute("href", "/dashboard/service");

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(controlledItems).not.toBeVisible();
  });

  it("starts expanded for the active route and retains the active destination semantics", () => {
    render(<Section active />);
    expect(screen.getByRole("button", { name: "Mon restaurant" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "Menu" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Pilotage de service" })).not.toHaveAttribute("aria-current");
  });

  it("opens when navigation makes a previously inactive section active", () => {
    const { rerender } = render(<Section />);
    expect(screen.queryByRole("link", { name: "Menu" })).not.toBeInTheDocument();
    rerender(<Section active />);
    expect(screen.getByRole("button", { name: "Mon restaurant" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "Menu" })).toBeVisible();

    // Leaving the section does not discard the user's expanded navigation.
    rerender(<Section />);
    expect(screen.getByRole("button", { name: "Mon restaurant" })).toHaveAttribute("aria-expanded", "true");
  });

  it("keeps all destinations reachable when the entire sidebar is collapsed", () => {
    const { rerender } = render(<Section />);
    rerender(<Section collapsed />);
    expect(screen.queryByRole("button", { name: "Mon restaurant" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Menu" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Pilotage de service" })).toBeVisible();

    rerender(<Section />);
    expect(screen.getByRole("button", { name: "Mon restaurant" })).toHaveAttribute("aria-expanded", "false");
  });

  it("gives separate sections independent controls and unique controlled regions", () => {
    render(<><Section /><Section /></>);
    const controls = screen.getAllByRole("button", { name: "Mon restaurant" });
    expect(controls[0].getAttribute("aria-controls")).not.toBe(controls[1].getAttribute("aria-controls"));
    fireEvent.click(controls[0]);
    expect(controls[0]).toHaveAttribute("aria-expanded", "true");
    expect(controls[1]).toHaveAttribute("aria-expanded", "false");
    expect(screen.getAllByRole("link", { name: "Menu" })).toHaveLength(1);
  });
});
