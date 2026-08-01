import {
  marketingLogoutHandler,
  type MarketingApiRequest,
  type MarketingApiResponse,
} from "../../server/marketingBff";

export default function handler(req: MarketingApiRequest, res: MarketingApiResponse) {
  return marketingLogoutHandler(req, res);
}
