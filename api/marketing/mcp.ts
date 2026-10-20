import { marketingMcpHandler, type MarketingApiRequest, type MarketingApiResponse } from "../../server/marketingBff.js";

export default function handler(req: MarketingApiRequest, res: MarketingApiResponse) {
  return marketingMcpHandler(req, res);
}
