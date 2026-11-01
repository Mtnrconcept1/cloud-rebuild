import { describe, expect, it } from "vitest";
import { GROWTH_MODEL, growthReservationMicros } from "../../supabase/functions/_shared/marketing-growth/budget";
const verifiedDate=Date.parse("2026-11-01T08:00:00Z");
describe("verified growth pricing",()=>{
 it("reserves the worst bounded input and output cost instead of an arbitrary operator number",()=>{expect(growthReservationMicros(GROWTH_MODEL,200000,verifiedDate)).toBe(105600);expect(growthReservationMicros(GROWTH_MODEL,1,verifiedDate)).toBeNull();});
 it("does not fall back to a cheap price for an unknown or aliased model",()=>{expect(growthReservationMicros("future-model",200000,verifiedDate)).toBeNull();expect(growthReservationMicros("gpt-4.1-mini",200000,verifiedDate)).toBeNull();});
 it("blocks after pricing validity expires until prices are reverified",()=>{expect(growthReservationMicros(GROWTH_MODEL,200000,Date.parse("2026-11-08T00:00:00Z"))).toBeNull();});
});
