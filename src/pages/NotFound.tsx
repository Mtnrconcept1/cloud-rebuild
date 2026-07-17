import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";

import { useSeoMeta } from "@/hooks/useSeoMeta";

const NotFound = () => {
  const location = useLocation();

  useSeoMeta({
    title: "Page introuvable | TOK",
    description: "Cette page n'existe pas ou n'est plus disponible.",
    path: location.pathname,
    robots: "noindex,nofollow,noarchive",
  });

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-muted px-4 py-12">
      <div className="w-full max-w-lg text-center">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-primary">Erreur 404</p>
        <h1 className="mt-3 text-4xl font-bold leading-tight sm:text-5xl">Page introuvable</h1>
        <p className="mx-auto mb-6 mt-4 max-w-md text-base text-muted-foreground sm:text-lg">
          L'adresse est peut-être incorrecte ou la page a été déplacée.
        </p>
        <Link
          to="/"
          className="inline-flex min-h-11 max-w-full items-center justify-center rounded-full bg-primary px-6 py-2.5 font-semibold text-primary-foreground transition hover:bg-primary/90"
        >
          Retour à l'accueil
        </Link>
      </div>
    </main>
  );
};

export default NotFound;
