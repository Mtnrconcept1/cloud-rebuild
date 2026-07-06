export type CommercialDemoLogin = {
  username: string;
  email: string;
  displayName: string;
  restaurantName: string;
};

export const COMMERCIAL_DEMO_LOGINS: CommercialDemoLogin[] = [
  {
    username: "commercial01",
    email: "commercial01@demo.thetok.ch",
    displayName: "Commercial TOK 01",
    restaurantName: "Bistro Demo Jet",
  },
  {
    username: "commercial02",
    email: "commercial02@demo.thetok.ch",
    displayName: "Commercial TOK 02",
    restaurantName: "Trattoria Demo Carouge",
  },
  {
    username: "commercial03",
    email: "commercial03@demo.thetok.ch",
    displayName: "Commercial TOK 03",
    restaurantName: "Burger Demo Plainpalais",
  },
  {
    username: "commercial04",
    email: "commercial04@demo.thetok.ch",
    displayName: "Commercial TOK 04",
    restaurantName: "Thai Demo Paquis",
  },
  {
    username: "commercial05",
    email: "commercial05@demo.thetok.ch",
    displayName: "Commercial TOK 05",
    restaurantName: "Sushi Demo Eaux-Vives",
  },
  {
    username: "commercial06",
    email: "commercial06@demo.thetok.ch",
    displayName: "Commercial TOK 06",
    restaurantName: "Grill Demo Nations",
  },
  {
    username: "commercial07",
    email: "commercial07@demo.thetok.ch",
    displayName: "Commercial TOK 07",
    restaurantName: "Brunch Demo Jonction",
  },
  {
    username: "commercial08",
    email: "commercial08@demo.thetok.ch",
    displayName: "Commercial TOK 08",
    restaurantName: "Mezze Demo Cornavin",
  },
  {
    username: "commercial09",
    email: "commercial09@demo.thetok.ch",
    displayName: "Commercial TOK 09",
    restaurantName: "Pizzeria Demo Servette",
  },
  {
    username: "commercial10",
    email: "commercial10@demo.thetok.ch",
    displayName: "Commercial TOK 10",
    restaurantName: "Cantine Demo Rive",
  },
];

export function getCommercialDemoLogin(username: string) {
  return COMMERCIAL_DEMO_LOGINS.find((account) => account.username === username) || null;
}
