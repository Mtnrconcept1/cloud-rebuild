import { useLocation } from "react-router-dom";

import CommercialMultiSpaceDemo from "@/components/commercial/CommercialMultiSpaceDemo";
import CommercialSingleSpaceDemo from "@/components/commercial/CommercialSingleSpaceDemo";
import CommercialWorkspaceChrome from "@/components/commercial/CommercialWorkspaceChrome";
import { isDemoWorkspaceSurface } from "@/lib/demoWorkspaces";

export default function CommercialDemoLive() {
  const location = useLocation();
  const requestedSurface = new URLSearchParams(location.search).get("surface");

  if (isDemoWorkspaceSurface(requestedSurface)) {
    return <CommercialSingleSpaceDemo surface={requestedSurface} />;
  }

  return (
    <>
      <CommercialWorkspaceChrome activeLabel="Démo multi-espace" />
      <main className="min-h-screen min-w-0 overflow-x-hidden bg-[radial-gradient(circle_at_top_left,rgba(255,106,26,0.14),transparent_34%),linear-gradient(135deg,#fff7ed_0%,#f8fafc_44%,#eef6ff_100%)] px-2 pb-5 pt-[calc(env(safe-area-inset-top,0px)+5rem)] text-slate-950 dark:bg-[radial-gradient(circle_at_top_left,rgba(255,106,26,0.18),transparent_34%),linear-gradient(135deg,#020617_0%,#0f172a_52%,#08111f_100%)] dark:text-white sm:px-3 md:pt-[calc(env(safe-area-inset-top,0px)+4.75rem)]">
        <div className="w-full min-w-0 max-w-none">
          <CommercialMultiSpaceDemo />
        </div>
      </main>
    </>
  );
}
