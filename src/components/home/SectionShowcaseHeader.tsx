import { useEffect, useRef, useState, type ReactNode } from "react";
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
  mobileLinkText?: string;
  linkTo?: string;
  className?: string;
  titleClassName?: string;
  contentClassName?: string;
  illustrationClassName?: string;
  imageClassName?: string;
  actions?: ReactNode;
};

/**
 * The text and artwork occupy separate grid cells on every breakpoint.
 * Original artwork is never faded, blurred, masked or covered by the copy.
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
  mobileLinkText,
  linkTo,
  className,
  titleClassName,
  contentClassName,
  illustrationClassName,
  imageClassName,
  actions,
}: SectionShowcaseHeaderProps) {
  const photographic = imageSrc.startsWith("/images/section-headers/tok-editorial-");
  const visualRef = useRef<HTMLDivElement>(null);
  const [shouldLoadImage, setShouldLoadImage] = useState(!photographic);

  useEffect(() => {
    if (!photographic || shouldLoadImage) return;

    const visual = visualRef.current;
    if (!visual) return;

    if (typeof IntersectionObserver === "undefined") {
      setShouldLoadImage(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setShouldLoadImage(true);
        observer.disconnect();
      },
      { rootMargin: "600px 0px" },
    );

    observer.observe(visual);
    return () => observer.disconnect();
  }, [photographic, shouldLoadImage]);

  return (
    <div
      data-section-showcase-header
      data-theme={theme}
      data-image-kind={photographic ? "photo" : "illustration"}
      className={cn("tok-section-header", className)}
    >
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
                <Link to={linkTo} aria-label={mobileLinkText ? linkText : undefined}>
                  <span className={mobileLinkText ? "hidden sm:inline" : undefined}>{linkText}</span>
                  {mobileLinkText ? <span className="sm:hidden" aria-hidden="true">{mobileLinkText}</span> : null}
                  <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />
                </Link>
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div
        ref={visualRef}
        className={cn("tok-section-header__visual", illustrationClassName)}
        aria-hidden="true"
        data-image-ready={!photographic || shouldLoadImage}
      >
        <img
          src={!photographic || shouldLoadImage ? imageSrc : undefined}
          data-deferred-src={photographic ? imageSrc : undefined}
          alt=""
          width={photographic ? 2508 : 600}
          height={photographic ? 627 : 340}
          loading="lazy"
          decoding="async"
          className={cn("tok-section-header__image", imageClassName)}
        />
      </div>
    </div>
  );
}
