import {
  marketingRpcHandler,
  type MarketingApiRequest,
  type MarketingApiResponse,
} from "../../server/marketingBff.js";

export default function handler(req: MarketingApiRequest, res: MarketingApiResponse) {
  return marketingRpcHandler(req, res);
}
