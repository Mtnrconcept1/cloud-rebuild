export type CommercialDemoLogin = {
  username: string;
  email: string;
  displayName: string;
  restaurantName: string;
};

// Les comptes commerciaux de simulation ont été retirés.
// Les commerciaux réels doivent se connecter avec leur compte Auth individuel.
export const COMMERCIAL_DEMO_LOGINS: CommercialDemoLogin[] = [];

export function getCommercialDemoLogin(username: string) {
  return COMMERCIAL_DEMO_LOGINS.find((account) => account.username === username) || null;
}
