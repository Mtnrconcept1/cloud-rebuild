import { Link } from "react-router-dom";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { legalSectionId } from "@/lib/legalDocuments";

export default function LegalDocumentTools({ sections = [] }: { sections?: readonly { title: string }[] }) {
  return (
    <div className="space-y-4 print:hidden">
      <nav aria-label="Documents et aide" className="flex flex-wrap gap-x-5 gap-y-3 text-sm font-semibold">
        <Link className="underline underline-offset-4" to="/cgu">CGU</Link>
        <Link className="underline underline-offset-4" to="/politique-confidentialite">Confidentialité</Link>
        <Link className="underline underline-offset-4" to="/cookies">Cookies</Link>
        <Link className="underline underline-offset-4" to="/aide#guide-client">Guide d’utilisation</Link>
        <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => window.print()}>
          <Printer className="h-4 w-4" aria-hidden="true" /> Imprimer / enregistrer en PDF
        </Button>
      </nav>
      {sections.length > 0 ? <details className="rounded-2xl border bg-muted/20 p-4">
        <summary className="cursor-pointer font-semibold">Aller à une rubrique</summary>
        <nav aria-label="Sommaire du document" className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          {sections.map((section) => <a key={section.title} className="underline underline-offset-4" href={`#${legalSectionId(section.title)}`}>{section.title}</a>)}
        </nav>
      </details> : null}
    </div>
  );
}
