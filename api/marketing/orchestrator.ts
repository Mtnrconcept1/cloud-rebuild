import {
  marketingOrchestratorHandler,
  type MarketingApiRequest,
  type MarketingApiResponse,
} from "../../server/marketingBff";

export default function handler(req: MarketingApiRequest, res: MarketingApiResponse) {
  return marketingOrchestratorHandler(req, res);
}
