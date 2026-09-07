import CommercialDemoOrderTracking from "@/components/commercial/CommercialDemoOrderTracking";
import { useCommercialDemoFrame } from "@/components/commercial/CommercialDemoFrameProvider";
import SuiviCommandeLive from "@/pages/SuiviCommandeLive";

export default function SuiviCommande() {
  const commercialDemoFrame = useCommercialDemoFrame();

  if (commercialDemoFrame?.surface === "client") {
    return <CommercialDemoOrderTracking />;
  }

  return <SuiviCommandeLive />;
}
