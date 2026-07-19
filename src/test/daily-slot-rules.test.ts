import { describe, expect, it } from "vitest";
import {
  SLOT_MAX_ATTEMPTS_PER_DAY,
  SLOT_MIN_REWARD_POINTS,
  SLOT_SYMBOL_WEIGHTS,
  generateSlotSymbols,
  scoreSlotSymbols,
  type SlotSymbolId,
} from "../../supabase/functions/daily-slot-spin/rules";

const symbolIds = SLOT_SYMBOL_WEIGHTS.map((symbol) => symbol.id);

describe("daily slot paytable", () => {
  it("keeps the three-attempt rule and a positive daily floor", () => {
    expect(SLOT_MAX_ATTEMPTS_PER_DAY).toBe(3);
    expect(SLOT_MIN_REWARD_POINTS).toBe(3);

    for (const first of symbolIds) {
      for (const second of symbolIds) {
        for (const third of symbolIds) {
          const reward = scoreSlotSymbols([first, second, third]);
          expect(reward.points).toBeGreaterThanOrEqual(SLOT_MIN_REWARD_POINTS);
        }
      }
    }
  });

  it("scores combination rules independently from reel order", () => {
    const permutations: SlotSymbolId[][] = [
      ["fork", "fork", "chef"],
      ["fork", "chef", "fork"],
      ["chef", "fork", "fork"],
    ];

    expect(permutations.map((symbols) => scoreSlotSymbols(symbols).points))
      .toEqual([20, 20, 20]);

    expect(scoreSlotSymbols(["tok_suisse", "tok_suisse", "tok_suisse"]).points)
      .toBe(100);
    expect(scoreSlotSymbols(["miamz", "miamz", "miamz"]).points)
      .toBe(24);
    expect(scoreSlotSymbols(["tok_suisse", "chef", "miamz"]).points)
      .toBe(3);
  });

  it("maps secure weighted tickets to deterministic symbols", () => {
    const tickets = [0, 1, 34];
    const generated = generateSlotSymbols(() => tickets.shift() ?? 0);

    expect(generated).toEqual(["tok_suisse", "fork", "miamz"]);
    expect(SLOT_SYMBOL_WEIGHTS[0].weight)
      .toBeLessThan(SLOT_SYMBOL_WEIGHTS.at(-1)?.weight || 0);
  });

  it("rejects malformed symbol lists", () => {
    expect(() => scoreSlotSymbols(["logo", "chef"])).toThrow(
      "three_symbols_required",
    );
  });
});

