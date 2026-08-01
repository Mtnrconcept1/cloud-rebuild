import {
  marketingMfaEnrollHandler,
  type MarketingApiRequest,
  type MarketingApiResponse,
} from "../../../server/marketingBff";

export default function handler(req: MarketingApiRequest, res: MarketingApiResponse) {
  return marketingMfaEnrollHandler(req, res);
}
