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
  heroImage?: string | false;
  /** Conservé pour les anciens appels, sans ajouter de mascotte dans le hero. */
  mascot?: "presenter" | "megaphone" | "cloche" | false;
  className?: string;
  presentation?: boolean;
};

export default function PageHeading({
  title,
  description,
  eyebrow,
  actions,
  heroImage,
  className,
  presentation = false,
}: Props) {
  const routeHero = typeof window === "undefined"
    ? undefined
    : getEditorialHeroVisual(window.location.pathname, window.location.search);
  const resolvedHero = heroImage === false ? undefined : heroImage ?? routeHero;
  const heroStyle = resolvedHero
    ? ({ "--tok-editorial-hero-image": `url("${resolvedHero}")` } as CSSProperties)
    : undefined;
  const subtitleStyle = description && resolvedHero && typeof window !== "undefined"
    ? getHeroSubtitleStyle(window.location.pathname, window.location.search)
    : undefined;

  return (
    <header
      role={presentation ? "presentation" : undefined}
      className={cn(
        "tok-editorial-heading",
        resolvedHero && "tok-editorial-heading--with-hero",
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
      {actions && <div className="tok-editorial-heading__actions">{actions}</div>}
    </header>
  );
}
