export * from "./tokAiClient";

import {
  generateTokDishImage as generateTokDishImageBase,
  type TokImageGenerationRequest,
} from "./tokAiClient";
import { applyMarketingOutputTargetToImageRequest } from "@/lib/marketing/outputSession";

/**
 * Exact Vite alias wrapper for the public TOK AI client.
 *
 * Every non-marketing request is byte-for-byte equivalent. Marketing Studio
 * requests opt in through `marketingAssetMode=true`, so only those receive the
 * final TheTok/social/print target selected by the output shell.
 */
export function generateTokDishImage(request: TokImageGenerationRequest) {
  return generateTokDishImageBase(applyMarketingOutputTargetToImageRequest(request));
}
