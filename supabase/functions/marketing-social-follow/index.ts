import { authenticateMarketingRequest } from "../_shared/marketing-service-auth.ts";
import { createMarketingSocialFollowHandler } from "../_shared/marketing-social-follow-handler.ts";
import { canonicalizeSocialProfileUrl } from "../_shared/marketing-social-profile.ts";
import { crawlRestaurantSocialProfiles } from "../_shared/marketing-social-site-crawler.ts";

Deno.serve(createMarketingSocialFollowHandler({
  authenticate: async (request) => {
    const actor = await authenticateMarketingRequest(request);
    return {
      authMode: actor.authMode,
      isServiceRole: actor.isServiceRole,
      rpc: (name, args, signal) => actor.adminClient.rpc(name, args).abortSignal(signal),
    };
  },
  canonicalize: canonicalizeSocialProfileUrl,
  crawl: crawlRestaurantSocialProfiles,
}));
