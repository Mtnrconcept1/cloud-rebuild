import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MARKETING_BFF_ENDPOINTS, marketingBffRequest } from "@/marketing/marketingBffClient";
import type { MarketingBacklinkRel } from "@/marketing/types";

import { findTokBacklink } from "@/marketing/growth/backlinkEvidence";

export default function MarketingBacklinkCheck({source,target,disabled,onEvidence}:{source:string;target:string;disabled:boolean;onEvidence:(rel:MarketingBacklinkRel,note:string)=>void}) {
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  async function check() {
    setBusy(true); setMessage("");
    try {
      const page=await marketingBffRequest<{source:string;checkedAt:string} & ({state:"redirect"}|{state:"read";html:string})>(MARKETING_BFF_ENDPOINTS.agent,{body:{action:"read_backlink_page",source}});
      if (page.state === "redirect") {
        setMessage("La page redirige. Vérifiez son adresse finale et les autorisations du domaine, puis relancez le contrôle avec cette adresse."); return;
      }
      const link=findTokBacklink(page.html,page.source,target);
      if (link) {
        const note=`Lien observé le ${page.checkedAt}. Ancre : ${link.anchor || "(sans texte)"}. rel : ${link.rel || "(absent)"}.`;
        onEvidence(link.kind,note); setMessage("Lien trouvé. Vérifiez la note avant de l’enregistrer.");
      } else setMessage("Aucun lien vers cette URL dans le HTML reçu. Le statut enregistré est conservé.");
    } catch(error) { setMessage(error instanceof Error ? error.message : "Vérification indisponible."); }
    finally { setBusy(false); }
  }
  return <div className="space-y-2 md:col-span-2"><Button type="button" variant="outline" disabled={busy||disabled||!source||!target} onClick={() => void check()}>{busy?"Lecture…":"Vérifier le lien dans la page source"}</Button>
   {message && <p role="status" className="text-sm">{message}</p>}</div>;
}
