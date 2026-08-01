import {
  marketingMfaVerifyHandler,
  type MarketingApiRequest,
  type MarketingApiResponse,
} from "../../../server/marketingBff.js";

export default function handler(req: MarketingApiRequest, res: MarketingApiResponse) {
  return marketingMfaVerifyHandler(req, res);
}
