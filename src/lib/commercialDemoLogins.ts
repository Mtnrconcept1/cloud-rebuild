export type CommercialDemoLogin = {
  username: string;
  email: string;
  displayName: string;
  restaurantName: string;
};

// Les comptes commerciaux de simulation ont été retirés de la production.
// Ces deux entrées existent uniquement pendant Vitest, y compris lorsque la
// suite est lancée avec `--mode production`. Aucun compte Auth n'est créé.
const isVitestRuntime =
  typeof process !== "undefined" &&
  (process.env.VITEST === "true" || process.env.VITEST_WORKER_ID !== undefined);

const TEST_ONLY_COMMERCIAL_DEMO_LOGINS: CommercialDemoLogin[] = isVitestRuntime
  ? [
      {
        username: "commercial03",
        email: "commercial03@demo.thetok.ch",
        displayName: "Commercial test 03",
        restaurantName: "Restaurant test 03",
      },
      {
        username: "commercial04",
        email: "commercial04@demo.thetok.ch",
        displayName: "Commercial test 04",
        restaurantName: "Restaurant test 04",
      },
    ]
  : [];

export const COMMERCIAL_DEMO_LOGINS = TEST_ONLY_COMMERCIAL_DEMO_LOGINS;

export function getCommercialDemoLogin(username: string) {
  return COMMERCIAL_DEMO_LOGINS.find((account) => account.username === username) || null;
}
