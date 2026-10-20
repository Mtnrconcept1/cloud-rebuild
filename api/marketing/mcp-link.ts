import { marketingMcpLinkHandler, type MarketingApiRequest, type MarketingApiResponse } from "../../server/marketingBff.js";

export default function handler(req: MarketingApiRequest, res: MarketingApiResponse) {
  return marketingMcpLinkHandler(req, res);
}
