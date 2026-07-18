export type GoogleBusinessSavingsInput = {
  monthlyTables: number;
  coversPerTable: number;
  commissionPerCoverChf: number;
  tokFeePerTableChf?: number;
  monthlyPackFeeChf?: number;
};

export type GoogleBusinessSavingsResult = {
  monthlyTables: number;
  monthlyCovers: number;
  perCoverModelCostChf: number;
  tokModelCostChf: number;
  monthlySavingsChf: number;
  annualSavingsChf: number;
  tokEffectiveCostPerCoverChf: number;
  isTokCheaper: boolean;
};

function positiveNumber(value: number, fallback = 0) {
  return Number.isFinite(value) ? Math.max(0, value) : fallback;
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

export function calculateGoogleBusinessSavings(input: GoogleBusinessSavingsInput): GoogleBusinessSavingsResult {
  const monthlyTables = positiveNumber(input.monthlyTables);
  const coversPerTable = positiveNumber(input.coversPerTable);
  const commissionPerCoverChf = positiveNumber(input.commissionPerCoverChf);
  const tokFeePerTableChf = positiveNumber(input.tokFeePerTableChf ?? 0);
  const monthlyPackFeeChf = positiveNumber(input.monthlyPackFeeChf ?? 0);

  const monthlyCovers = roundCurrency(monthlyTables * coversPerTable);
  const perCoverModelCostChf = roundCurrency(monthlyCovers * commissionPerCoverChf);
  const tokModelCostChf = roundCurrency(monthlyTables * tokFeePerTableChf + monthlyPackFeeChf);
  const monthlySavingsChf = roundCurrency(perCoverModelCostChf - tokModelCostChf);
  const annualSavingsChf = roundCurrency(monthlySavingsChf * 12);
  const tokEffectiveCostPerCoverChf = monthlyCovers > 0 ? roundCurrency(tokModelCostChf / monthlyCovers) : 0;

  return {
    monthlyTables,
    monthlyCovers,
    perCoverModelCostChf,
    tokModelCostChf,
    monthlySavingsChf,
    annualSavingsChf,
    tokEffectiveCostPerCoverChf,
    isTokCheaper: monthlySavingsChf > 0,
  };
}
