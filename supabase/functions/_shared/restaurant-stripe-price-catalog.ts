/**
 * TOK's immutable, mode-scoped Stripe price catalog.
 * Only pre-provisioned prices may be used to start/schedule new subscriptions.
 * Amount and product are revalidated against Stripe to fail closed on drift.
 */
type CatalogMode = "live" | "test";
type CatalogInterval = "month" | "year";
type CatalogEntry = { planId: string; live: Record<CatalogInterval, readonly [string, string]>; test: Record<CatalogInterval, readonly [string, string]> };

const RESTAURANT_PRICE_CATALOG: Record<string, CatalogEntry> = {
  "starter": {
    "planId": "537770ef-5b8c-4324-be2a-5feaf680db0c",
    "live": {
      "month": [
        "price_1UQDzJGTQigE34suqk1aFMIm",
        "prod_VR6BQMeEzxe31F"
      ],
      "year": [
        "price_1UQITDGTQigE34sucmcKRqMf",
        "prod_VR6BQMeEzxe31F"
      ]
    },
    "test": {
      "month": [
        "price_1UQISaGTQigE34su0kQ7ATp4",
        "prod_VRAouJFODh4pNo"
      ],
      "year": [
        "price_1UQITLGTQigE34sumPoc749K",
        "prod_VRAouJFODh4pNo"
      ]
    }
  },
  "pro": {
    "planId": "cda18a9d-f18e-4610-8b27-79863fb8e2d3",
    "live": {
      "month": [
        "price_1UQIRwGTQigE34su8yHIM2gT",
        "prod_VRAn3TQhk8uFjQ"
      ],
      "year": [
        "price_1UQITFGTQigE34su1Rv3qmDs",
        "prod_VRAn3TQhk8uFjQ"
      ]
    },
    "test": {
      "month": [
        "price_1UQIScGTQigE34suxE5jLYwS",
        "prod_VRAoe2PnWKYZN4"
      ],
      "year": [
        "price_1UQITNGTQigE34susfbBIMoR",
        "prod_VRAoe2PnWKYZN4"
      ]
    }
  },
  "premium": {
    "planId": "0d63c3a8-fdbb-46a8-ab89-fb427039e8d4",
    "live": {
      "month": [
        "price_1UQIS8GTQigE34suT0czu7ui",
        "prod_VRAnKI3kKwrj1c"
      ],
      "year": [
        "price_1UQITHGTQigE34suCiRGArrd",
        "prod_VRAnKI3kKwrj1c"
      ]
    },
    "test": {
      "month": [
        "price_1UQISdGTQigE34su026r5Yvt",
        "prod_VRAoI5pnaLhSLw"
      ],
      "year": [
        "price_1UQITPGTQigE34suBa3Aj8Ug",
        "prod_VRAoI5pnaLhSLw"
      ]
    }
  },
  "elite": {
    "planId": "c0b54278-1314-483c-9632-5a3f1d06b7c5",
    "live": {
      "month": [
        "price_1UQISAGTQigE34suGpq6fMSc",
        "prod_VRAnTt7T41EoxZ"
      ],
      "year": [
        "price_1UQITJGTQigE34suFYRBw3TM",
        "prod_VRAnTt7T41EoxZ"
      ]
    },
    "test": {
      "month": [
        "price_1UQISgGTQigE34su8b6l4auJ",
        "prod_VRAofgeXORgaqT"
      ],
      "year": [
        "price_1UQITQGTQigE34suozZax6Nq",
        "prod_VRAofgeXORgaqT"
      ]
    }
  }
} as const;

type StripePriceReader = {
  prices: {
    retrieve: (id: string) => Promise<{
      id: string;
      active: boolean;
      livemode: boolean;
      currency: string;
      unit_amount: number | null;
      product: string | { id: string };
      recurring: { interval: string } | null;
    }>;
  };
};

export async function resolveRestaurantSubscriptionCatalogPrice(
  stripe: StripePriceReader,
  input: { planId: string; slug: string; mode: CatalogMode; interval: CatalogInterval; amountCents: number },
): Promise<string> {
  const entry = RESTAURANT_PRICE_CATALOG[input.slug];
  if (!entry || entry.planId !== input.planId) {
    throw new Error("TOK_STRIPE_CATALOG_UNKNOWN_PLAN");
  }
  const [priceId, productId] = entry[input.mode][input.interval];
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) {
    throw new Error("TOK_STRIPE_CATALOG_INVALID_AMOUNT");
  }
  const price = await stripe.prices.retrieve(priceId);
  const actualProductId = typeof price.product === "string" ? price.product : price.product?.id;
  if (
    !price.active ||
    price.livemode !== (input.mode === "live") ||
    price.currency !== "chf" ||
    price.unit_amount !== input.amountCents ||
    price.recurring?.interval !== input.interval ||
    actualProductId !== productId
  ) {
    throw new Error("TOK_STRIPE_CATALOG_PRICE_MISMATCH");
  }
  return price.id;
}
