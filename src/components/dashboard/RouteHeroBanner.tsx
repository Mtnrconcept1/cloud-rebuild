import PageHeading from "@/components/editorial/PageHeading";

type RouteHeroBannerProps = {
  src?: string;
  title: string;
  eyebrow: string;
  description: string;
};

/**
 * Fallback éditorial uniquement pour les routes sans titre natif.
 * WorkspaceDesign.css masque cette carte lorsqu'une page fournit son propre PageHeading.
 */
export default function RouteHeroBanner({ src, title, eyebrow, description }: RouteHeroBannerProps) {
  if (!src) return null;

  return (
    <PageHeading
      heroImage={src}
      title={title}
      eyebrow={eyebrow}
      description={description}
      className="tok-route-hero-fallback"
    />
  );
}
