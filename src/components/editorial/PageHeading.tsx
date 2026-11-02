import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import "./editorial.css";

type Props = {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  artwork?: ReactNode;
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
  mascot = "presenter",
  className,
}: Props) {
  const resolvedArtwork = artwork ?? (mascot ? (
    <img
      src={mascotSources[mascot]}
      alt=""
      className="tok-editorial-heading__mascot"
      loading="eager"
      decoding="async"
    />
  ) : null);

  return (
    <header className={cn("tok-editorial-heading", resolvedArtwork && "tok-editorial-heading--illustrated", className)}>
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
