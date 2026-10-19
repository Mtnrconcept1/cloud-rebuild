import {
  marketingSocialFollowHandler,
  type MarketingApiRequest,
  type MarketingApiResponse,
} from "../../server/marketingBff.js";

// Covers the bounded collection plus the existing session and admin checks.
export const maxDuration = 90;

export default function handler(req: MarketingApiRequest, res: MarketingApiResponse) {
  return marketingSocialFollowHandler(req, res);
}
