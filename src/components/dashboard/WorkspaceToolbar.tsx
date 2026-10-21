import { useState, type ComponentType, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowUpRight, Search } from "lucide-react";

import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth-context";

export type WorkspaceTool = {
  to: string;
  label: string;
  group: string;
  icon: ComponentType<{ className?: string }>;
};

/** Search only the tools the current workspace is already allowed to open. */
export function WorkspaceToolSearch({ tools }: { tools: WorkspaceTool[] }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const groups = [...new Set(tools.map((tool) => tool.group))];

  return (
    <>
      <button type="button" className="tok-workspace-search" onClick={() => setOpen(true)} aria-label="Rechercher un outil du dashboard">
        <Search className="h-5 w-5 shrink-0" aria-hidden="true" />
        <span>Rechercher un outil, une page du dashboard…</span>
      </button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <DialogTitle className="sr-only">Rechercher dans le dashboard</DialogTitle>
        <DialogDescription className="sr-only">Accédez aux outils disponibles pour votre restaurant.</DialogDescription>
        <CommandInput placeholder="Réservations, commandes, menu…" />
        <CommandList>
          <CommandEmpty>Aucun outil ne correspond à votre recherche.</CommandEmpty>
          {groups.map((group) => (
            <CommandGroup key={group} heading={group}>
              {tools.filter((tool) => tool.group === group).map((tool) => (
                <CommandItem key={tool.to} value={`${tool.label} ${tool.group}`} onSelect={() => { setOpen(false); navigate(tool.to); }}>
                  <tool.icon className="mr-3 h-4 w-4" />
                  {tool.label}
                  <ArrowUpRight className="ml-auto h-4 w-4 opacity-50" aria-hidden="true" />
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </CommandDialog>
    </>
  );
}

export function WorkspaceRestaurantSearch() {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = query.trim();
    navigate(value ? `/recherche?q=${encodeURIComponent(value)}` : "/recherche");
  };

  return (
    <form role="search" className="tok-workspace-search" onSubmit={submit}>
      <button type="submit" aria-label="Rechercher un restaurant" className="shrink-0 rounded-md p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        <Search className="h-5 w-5" aria-hidden="true" />
      </button>
      <input aria-label="Trouver un restaurant" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Trouver un restaurant" />
    </form>
  );
}

export function WorkspaceAccountLink({ to }: { to: string }) {
  const { user } = useAuth();
  const metadata = user?.user_metadata;
  const fullName = [metadata?.full_name, metadata?.name, metadata?.display_name, metadata?.first_name]
    .find((value): value is string => typeof value === "string" && Boolean(value.trim()));
  const name = fullName?.trim().split(/\s+/)[0] || "Mon compte";
  const initials = fullName?.trim().split(/\s+/).slice(0, 2).map((word) => word[0]).join("").toUpperCase() || "TOK";

  return (
    <Link to={to} className="tok-workspace-account" aria-label="Ouvrir mon compte">
      <span className="tok-workspace-avatar" aria-hidden="true">{initials}</span>
      <span className="hidden max-w-28 truncate lg:block">{name}</span>
    </Link>
  );
}

export default function WorkspaceToolbar({ search, children, className = "" }: { search: ReactNode; children: ReactNode; className?: string }) {
  return (
    <header className={`tok-workspace-toolbar ${className}`}>
      <div className="min-w-0 flex-1">{search}</div>
      <div className="tok-workspace-toolbar-actions">{children}</div>
    </header>
  );
}
