import { useState } from "react";
import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import AdminUserDirectoryFilters from "@/components/admin/AdminUserDirectoryFilters";
import { DEFAULT_USER_FILTERS, filterAdminUsers, type AdminUserFilters } from "@/lib/adminUserDirectory";
afterEach(cleanup);
const users = [
  { user_id: "a", full_name: "Émile", email: "emile@example.ch", city: "Genève", roles: ["restaurateur"] },
  { user_id: "b", full_name: "Zoé", email: "zoe@example.ch", city: "Vernier", roles: ["client", "commercial"] },
];
function Directory() {
  const [filters, setFilters] = useState<AdminUserFilters>(DEFAULT_USER_FILTERS);
  const result = filterAdminUsers(users, filters);
  return <>
    <AdminUserDirectoryFilters filters={filters} onChange={setFilters} resultCount={result.length} totalCount={users.length}
      roleCounts={{ client: 1, restaurateur: 1, commercial: 1 }} anomalyLabels={{ email_unconfirmed: "Email non confirmé" }} />
    <ol aria-label="Résultats">{result.map((user) => <li key={user.user_id}>{user.full_name}</li>)}</ol>
  </>;
}
describe("user directory filter controls", () => {
  it("sorts through the labelled control", () => {
    render(<Directory />);
    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual(["Émile", "Zoé"]);
    fireEvent.change(screen.getByLabelText("Trier les utilisateurs"), { target: { value: "name_desc" } });
    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual(["Zoé", "Émile"]);
  });
  it("selects several roles and resets the complete segment", () => {
    render(<Directory />);
    fireEvent.click(screen.getByRole("button", { name: "Tout décocher" }));
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    fireEvent.click(screen.getByLabelText("Restaurateur (1)"));
    fireEvent.click(screen.getByLabelText("Commercial (1)"));
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    fireEvent.change(screen.getByLabelText("Ville contient"), { target: { value: "geneve" } });
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByRole("status")).toHaveTextContent("1 utilisateur sur 2");
    fireEvent.click(screen.getByRole("button", { name: "Réinitialiser les filtres" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByLabelText("Ville contient")).toHaveValue("");
    expect(screen.getByLabelText("Client (1)")).toBeChecked();
  });
  it("combines search terms with selected roles", () => {
    render(<Directory />);
    fireEvent.change(screen.getByLabelText("Recherche globale"), { target: { value: "emile geneve" } });
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    fireEvent.click(screen.getByLabelText("Restaurateur (1)"));
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });
  it("explains inverted date bounds", () => {
    render(<Directory />);
    fireEvent.change(screen.getByLabelText("Inscrit depuis le (Suisse)"), { target: { value: "2026-11-02" } });
    fireEvent.change(screen.getByLabelText("Inscrit jusqu'au (Suisse)"), { target: { value: "2026-11-01" } });
    expect(screen.getByRole("alert")).toHaveTextContent("La date de début doit précéder la date de fin.");
  });
});
