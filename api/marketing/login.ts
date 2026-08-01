import {
  marketingLoginHandler,
  type MarketingApiRequest,
  type MarketingApiResponse,
} from "../../server/marketingBff";

export default function handler(req: MarketingApiRequest, res: MarketingApiResponse) {
  return marketingLoginHandler(req, res);
}
