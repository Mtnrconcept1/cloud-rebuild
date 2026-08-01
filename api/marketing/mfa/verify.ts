import {
  marketingMfaVerifyHandler,
  type MarketingApiRequest,
  type MarketingApiResponse,
} from "../../../server/marketingBff";

export default function handler(req: MarketingApiRequest, res: MarketingApiResponse) {
  return marketingMfaVerifyHandler(req, res);
}
