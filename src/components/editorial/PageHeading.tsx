import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { getEditorialHeroVisual } from "@/lib/editorialHeroVisuals";
import { getHeroSubtitleStyle } from "@/lib/heroSubtitleStyles";
import "./editorial.css";

type Props = {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  artwork?: ReactNode;
  heroImage?: string | false;
  mascot?: "presenter" | "megaphone" | "cloche" | false;
  className?: string;
};

const mascotSources = {
  presenter: "/images/tok-refonte/chef-presentateur.webp",
  megaphone: "/images/tok-refonte/chef-megaphone.webp",
  cloche: "/images/tok-refonte/chef-cloche.webp",
} as const;

export default function PageHeading({
  title,
  description,
  eyebrow,
  actions,
  artwork,
  heroImage,
  mascot = "presenter",
  className,
}: Props) {
  const routeHero = typeof window === "undefined"
    ? undefined
    : getEditorialHeroVisual(window.location.pathname, window.location.search);
  const resolvedHero = heroImage === false ? undefined : heroImage ?? routeHero;
  const resolvedArtwork = artwork ?? (mascot ? (
    <img
      src={mascotSources[mascot]}
      alt=""
      className="tok-editorial-heading__mascot"
      loading="eager"
      decoding="async"
    />
  ) : null);
  const heroStyle = resolvedHero
    ? ({ "--tok-editorial-hero-image": `url("${resolvedHero}")` } as CSSProperties)
    : undefined;
  const subtitleStyle = description && resolvedHero && typeof window !== "undefined"
    ? getHeroSubtitleStyle(window.location.pathname, window.location.search)
    : undefined;

  return (
    <header
      className={cn(
        "tok-editorial-heading",
        resolvedHero && "tok-editorial-heading--with-hero",
        resolvedArtwork && "tok-editorial-heading--illustrated",
        className,
      )}
      data-editorial-hero={resolvedHero}
      data-subtitle-style={subtitleStyle}
      style={heroStyle}
    >
      <div className="tok-editorial-heading__copy">
        {eyebrow && <div className="tok-editorial-heading__eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <div className="tok-editorial-heading__description">{description}</div>}
      </div>
      {resolvedArtwork && <div className="tok-editorial-heading__art" aria-hidden="true">{resolvedArtwork}</div>}
      {actions && <div className="tok-editorial-heading__actions">{actions}</div>}
    </header>
  );
}
