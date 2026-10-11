import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type SectionHeaderTheme = "orange" | "rose" | "sky" | "amber" | "indigo" | "emerald" | "blue" | "slate";

type SectionShowcaseHeaderProps = {
  title: string;
  subtitle: string;
  description?: string;
  icon: LucideIcon;
  imageSrc: string;
  iconColor?: string;
  theme?: SectionHeaderTheme;
  linkText?: string;
  linkTo?: string;
  className?: string;
  titleClassName?: string;
  contentClassName?: string;
  illustrationClassName?: string;
  imageClassName?: string;
  actions?: ReactNode;
};

/**
 * A shared, SEO-friendly TOK editorial heading.
 * Photography is decorative; headings, descriptions and links remain real HTML.
 */
export default function SectionShowcaseHeader({
  title,
  subtitle,
  description,
  icon: Icon,
  imageSrc,
  iconColor,
  theme = "orange",
  linkText,
  linkTo,
  className,
  titleClassName,
  contentClassName,
  illustrationClassName,
  imageClassName,
  actions,
}: SectionShowcaseHeaderProps) {
  const photographic = imageSrc.startsWith("/images/section-headers/tok-editorial-");

  return (
    <div
      data-section-showcase-header
      data-theme={theme}
      data-image-kind={photographic ? "photo" : "illustration"}
      className={cn("tok-section-header", className)}
    >
      <div
        className={cn("tok-section-header__visual", illustrationClassName)}
        aria-hidden="true"
      >
        <img
          src={imageSrc}
          alt=""
          width={600}
          height={340}
          loading="lazy"
          decoding="async"
          className={cn("tok-section-header__image", imageClassName)}
        />
      </div>

      <div className={cn("tok-section-header__content", contentClassName)}>
        <div className="tok-section-header__eyebrow">
          <span className="tok-section-header__symbol" aria-hidden="true">
            <Icon className={cn("tok-section-header__glyph", iconColor)} aria-hidden="true" />
          </span>
          <span>{subtitle}</span>
        </div>

        <h2 className={cn("tok-section-header__title font-display", titleClassName)}>{title}</h2>
        {description ? <p className="tok-section-header__description">{description}</p> : null}

        {(actions || (linkText && linkTo)) ? (
          <div data-section-action-row className="tok-section-header__actions">
            {actions}
            {linkText && linkTo ? (
              <Button variant="ghost" className="tok-section-header__cta" asChild>
                <Link to={linkTo}>
                  <span>{linkText}</span>
                  <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />
                </Link>
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
