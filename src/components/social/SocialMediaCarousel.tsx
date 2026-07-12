import { type MouseEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ImageIcon, MessageCircle, ThumbsUp, Video, X } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { isVerticalSocialVideoDimensions } from "@/lib/media/socialMediaCompression";
import {
  getOptimizedImageSizes,
  getOptimizedImageSrcSet,
  getOptimizedImageUrl,
} from "@/lib/optimizedImages";
import type { SocialFeedMedia } from "@/lib/socialFeed";
import { cn } from "@/lib/utils";

type SocialMediaCarouselProps = {
  media: SocialFeedMedia[];
  variant?: "default" | "side";
  className?: string;
  mobileOverlay?: ReactNode;
  mobileBleed?: "viewport" | "container" | false;
  constrainedPreview?: boolean;
  lightboxEngagement?: {
    likesCount: number;
    commentsCount: number;
  };
  lightboxActions?: ReactNode | ((helpers: { close: () => void }) => ReactNode);
};

function AutoPlayOnViewVideo({
  item,
  className,
  onLoadedMetadata,
  onPlaybackChange,
  onClick,
}: {
  item: SocialFeedMedia;
  className?: string;
  onLoadedMetadata: (video: HTMLVideoElement) => void;
  onPlaybackChange: (playing: boolean) => void;
  onClick?: (event: MouseEvent<HTMLVideoElement>) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (
      !video ||
      typeof window === "undefined" ||
      !("IntersectionObserver" in window)
    )
      return;

    const reduceMotion =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const pauseVideo = () => {
      if (!video.paused) {
        video.pause();
      }
    };

    if (reduceMotion) {
      pauseVideo();
      return;
    }

    const playVisibleVideo = () => {
      const playPromise = video.play();
      if (typeof playPromise?.catch === "function") {
        playPromise.catch(() => {
          pauseVideo();
        });
      }
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;

        if (entry.isIntersecting && entry.intersectionRatio >= 0.55) {
          playVisibleVideo();
          return;
        }

        if (!entry.isIntersecting || entry.intersectionRatio <= 0.2) {
          pauseVideo();
        }
      },
      { threshold: [0, 0.2, 0.55, 1] },
    );

    const handleVisibilityChange = () => {
      if (document.hidden) {
        pauseVideo();
      }
    };

    observer.observe(video);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      observer.disconnect();
      pauseVideo();
    };
  }, []);

  return (
    <video
      ref={videoRef}
      src={item.mediaUrl}
      controls
      muted
      playsInline
      preload="metadata"
      className={className}
      onLoadedMetadata={(event) => onLoadedMetadata(event.currentTarget)}
      onPlay={() => onPlaybackChange(true)}
      onPause={() => onPlaybackChange(false)}
      onEnded={() => onPlaybackChange(false)}
      aria-label={item.altText || "Vidéo du restaurant"}
      onClick={onClick}
      data-autoplay-on-view="true"
    >
      <track kind="captions" />
    </video>
  );
}

export default function SocialMediaCarousel({
  media,
  variant = "default",
  className,
  mobileOverlay,
  mobileBleed = "viewport",
  constrainedPreview = false,
  lightboxEngagement,
  lightboxActions,
}: SocialMediaCarouselProps) {
  const [verticalVideoIds, setVerticalVideoIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [portraitImageIds, setPortraitImageIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [playingVideoIds, setPlayingVideoIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const lightboxTriggerRef = useRef<HTMLElement | null>(null);
  const lightboxWasOpenRef = useRef(false);

  useEffect(() => {
    if (lightboxIndex === null || media.length < 2) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLVideoElement) return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setLightboxIndex((current) => current === null ? current : (current - 1 + media.length) % media.length);
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        setLightboxIndex((current) => current === null ? current : (current + 1) % media.length);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [lightboxIndex, media.length]);

  useEffect(() => {
    if (lightboxIndex !== null) {
      lightboxWasOpenRef.current = true;
      return undefined;
    }
    if (!lightboxWasOpenRef.current) return undefined;

    lightboxWasOpenRef.current = false;
    const frame = window.requestAnimationFrame(() => lightboxTriggerRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [lightboxIndex]);

  if (!media.length) return null;

  const frameBaseClassName = "relative overflow-hidden border bg-muted";
  const videoFrameClassName = cn(
    frameBaseClassName,
    variant === "side"
      ? "aspect-[16/9] min-h-0 rounded-[1.45rem] shadow-xl shadow-orange-100/70 max-sm:rounded-[1.35rem] max-sm:border-0 max-sm:shadow-none sm:min-h-[16rem]"
      : "aspect-[4/3] rounded-lg",
    constrainedPreview && "flex max-h-[min(62dvh,36rem)] items-center justify-center",
  );
  const imageFrameClassName = cn(
    frameBaseClassName,
    variant === "side"
      ? "flex max-h-[min(70dvh,42rem)] items-center justify-center rounded-[1.45rem] shadow-xl shadow-orange-100/70 max-sm:rounded-[1.35rem] max-sm:border-0 max-sm:shadow-none"
      : "rounded-lg",
    constrainedPreview && "flex max-h-[min(62dvh,36rem)] items-center justify-center",
  );
  const containerClassName = cn(
    variant === "side" ? "mt-0" : "mt-4",
    className,
  );
  const imagePreset = variant === "side" ? "hero" : "card";
  const isPortraitMedia = (item: SocialFeedMedia) =>
    (item.mediaType === "video" && verticalVideoIds.has(item.id)) ||
    (item.mediaType === "image" && portraitImageIds.has(item.id));
  const openLightbox = (item: SocialFeedMedia, trigger?: HTMLElement | null) => {
    const index = media.findIndex((mediaItem) => mediaItem.id === item.id);
    lightboxTriggerRef.current = trigger || null;
    setLightboxIndex(index >= 0 ? index : 0);
  };
  const getContainerClassName = (item: SocialFeedMedia) =>
    cn(
      containerClassName,
      variant === "side" &&
        mobileBleed === "viewport" &&
        "max-sm:-mx-6 max-sm:w-screen",
      variant === "side" &&
        mobileBleed === "container" &&
        "max-sm:-mx-4 max-sm:w-[calc(100%+2rem)]",
    );
  const getFrameClassName = (item: SocialFeedMedia) =>
    cn(
      item.mediaType === "video" ? videoFrameClassName : imageFrameClassName,
      variant === "side" && "max-sm:rounded-none",
      variant === "side" &&
        item.mediaType === "video" &&
        verticalVideoIds.has(item.id) &&
        "max-sm:aspect-[5/6]",
      isPortraitMedia(item) && "bg-black",
    );
  const updateVideoPlayback = (itemId: string, playing: boolean) => {
    setPlayingVideoIds((current) => {
      const next = new Set(current);
      if (playing) {
        next.add(itemId);
      } else {
        next.delete(itemId);
      }
      return next;
    });
  };
  const renderMobileOverlay = (item: SocialFeedMedia) => {
    if (!mobileOverlay) return null;

    const shouldHideOverlay =
      item.mediaType === "video" && playingVideoIds.has(item.id);

    return (
      <div
        className={cn(
          "transition-opacity duration-200",
          shouldHideOverlay && "max-sm:pointer-events-none max-sm:opacity-0",
        )}
        data-media-overlay-state={
          shouldHideOverlay ? "hidden-while-playing" : "visible"
        }
      >
        {mobileOverlay}
      </div>
    );
  };

  const renderMedia = (item: SocialFeedMedia) => {
    if (item.mediaType === "video") {
      return (
        <AutoPlayOnViewVideo
          item={item}
          className={cn(
            "bg-black object-contain",
            constrainedPreview ? "max-h-[min(62dvh,36rem)] max-w-full" : "h-full w-full",
          )}
          onLoadedMetadata={(video) => {
            if (
              !isVerticalSocialVideoDimensions(
                video.videoWidth,
                video.videoHeight,
              )
            )
              return;
            setVerticalVideoIds((current) => {
              if (current.has(item.id)) return current;
              const next = new Set(current);
              next.add(item.id);
              return next;
            });
          }}
          onPlaybackChange={(playing) => updateVideoPlayback(item.id, playing)}
          onClick={(event) => openLightbox(item, event.currentTarget)}
        />
      );
    }

    return (
      <button
        type="button"
        className="flex min-h-11 w-full cursor-zoom-in items-center justify-center rounded-[inherit] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-500/70 focus-visible:ring-inset"
        aria-label={`Agrandir l’image : ${item.altText || "média du restaurant"}`}
        onClick={(event) => openLightbox(item, event.currentTarget)}
      >
        <img
        // Guarded by actualites-responsive-guards: height: undefined, resize: "contain"
        src={getOptimizedImageUrl(item.mediaUrl, imagePreset, {
          height: undefined,
          resize: "contain",
        })}
        srcSet={getOptimizedImageSrcSet(item.mediaUrl, imagePreset, {
          resize: "contain",
        })}
        sizes={getOptimizedImageSizes(imagePreset)}
        alt={item.altText || ""}
        className={cn(
          "object-contain",
          constrainedPreview
            ? "h-auto max-h-[min(62dvh,36rem)] w-auto max-w-full"
            : variant === "side"
              ? "h-auto max-h-[min(70dvh,42rem)] w-auto max-w-full"
              : "h-auto w-full",
        )}
        loading="lazy"
        onLoad={(event) => {
          const image = event.currentTarget;
          if (image.naturalHeight <= image.naturalWidth) return;
          setPortraitImageIds((current) => {
            if (current.has(item.id)) return current;
            const next = new Set(current);
            next.add(item.id);
            return next;
          });
        }}
        decoding="async"
        />
      </button>
    );
  };

  const renderLightboxMedia = (item: SocialFeedMedia) => {
    if (item.mediaType === "video") {
      return (
        <video
          src={item.mediaUrl}
          controls
          playsInline
          className="h-full w-full object-contain"
          aria-label={item.altText || "Vidéo du restaurant"}
        >
          <track kind="captions" />
        </video>
      );
    }

    return (
      <img
        src={getOptimizedImageUrl(item.mediaUrl, "hero")}
        srcSet={getOptimizedImageSrcSet(item.mediaUrl, "hero")}
        sizes="100vw"
        alt={item.altText || "Média du restaurant"}
        className="h-full w-full object-contain"
        decoding="async"
      />
    );
  };

  const closeLightbox = () => setLightboxIndex(null);
  const lightboxItem =
    lightboxIndex === null ? null : media[lightboxIndex] || media[0];
  const lightboxActionContent =
    typeof lightboxActions === "function"
      ? lightboxActions({ close: closeLightbox })
      : lightboxActions;
  const lightbox = (
    <Dialog
      open={lightboxIndex !== null}
      onOpenChange={(open) => !open && closeLightbox()}
    >
      <DialogContent className="flex h-[100dvh] w-screen max-w-none translate-y-[-50%] grid-cols-none flex-col gap-0 overflow-hidden rounded-none border-0 bg-black p-0 text-white shadow-none sm:w-screen">
        <DialogTitle className="sr-only">Média de l’actualité</DialogTitle>
        <DialogDescription className="sr-only">
          Vue agrandie du média avec son ratio d’origine.
        </DialogDescription>
        <button
          type="button"
          aria-label="Fermer le média"
          onClick={closeLightbox}
          className="absolute left-4 top-[calc(env(safe-area-inset-top,0px)+1rem)] z-10 rounded-full p-2 text-white transition hover:bg-white/10"
        >
          <X className="h-7 w-7" />
        </button>
        <div className="absolute right-5 top-[calc(env(safe-area-inset-top,0px)+1.25rem)] z-10 rounded-full bg-black/45 px-3 py-1 text-sm font-semibold text-white">
          <span aria-live="polite">{lightboxIndex === null ? 0 : lightboxIndex + 1}/{media.length}</span>
        </div>
        {media.length > 1 ? (
          <>
            <button
              type="button"
              aria-label="Média précédent"
              onClick={() => setLightboxIndex((current) => current === null ? current : (current - 1 + media.length) % media.length)}
              className="absolute left-3 top-1/2 z-10 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white transition hover:bg-black/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <ChevronLeft className="h-7 w-7" />
            </button>
            <button
              type="button"
              aria-label="Média suivant"
              onClick={() => setLightboxIndex((current) => current === null ? current : (current + 1) % media.length)}
              className="absolute right-3 top-1/2 z-10 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white transition hover:bg-black/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <ChevronRight className="h-7 w-7" />
            </button>
          </>
        ) : null}
        <div className="flex min-h-0 flex-1 items-center justify-center bg-black px-0 pt-[calc(env(safe-area-inset-top,0px)+4.5rem)]">
          {lightboxItem ? renderLightboxMedia(lightboxItem) : null}
        </div>
        <div className="shrink-0 border-t border-white/10 bg-black/95 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] pt-3">
          {lightboxActionContent ? (
            <div className="mx-auto max-w-xl">{lightboxActionContent}</div>
          ) : (
            <div className="mx-auto flex max-w-xl items-center justify-around gap-4 rounded-2xl bg-white/5 px-4 py-3 text-sm font-bold text-white">
              <span className="inline-flex items-center gap-2">
                <ThumbsUp className="h-5 w-5" />
                {lightboxEngagement?.likesCount ?? 0}
              </span>
              <span className="inline-flex items-center gap-2">
                <MessageCircle className="h-5 w-5" />
                {lightboxEngagement?.commentsCount ?? 0}
              </span>
              <span className="text-xs font-semibold text-white/70">
                Like/commentaire visibles
              </span>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );

  if (media.length === 1) {
    const item = media[0];
    return (
      <>
        <div
          className={cn(
            getContainerClassName(item),
            getFrameClassName(item),
            "cursor-zoom-in",
          )}
        >
          {renderMedia(item)}
          <div className="absolute left-3 top-3 rounded-full bg-black/55 px-2 py-1 text-xs font-medium text-white backdrop-blur">
            {item.mediaType === "video" ? (
              <Video className="mr-1 inline h-3 w-3" />
            ) : (
              <ImageIcon className="mr-1 inline h-3 w-3" />
            )}
            1/1
          </div>
          {renderMobileOverlay(item)}
        </div>
        {lightbox}
      </>
    );
  }

  return (
    <Carousel className={containerClassName} opts={{ loop: false }}>
      <CarouselContent className="-ml-2">
        {media.map((item, index) => (
          <CarouselItem key={item.id} className="pl-2">
            <div className={cn(getFrameClassName(item), "cursor-zoom-in")}>
              {renderMedia(item)}
              <div className="absolute left-3 top-3 rounded-full bg-black/55 px-2 py-1 text-xs font-medium text-white backdrop-blur">
                {item.mediaType === "video" ? (
                  <Video className="mr-1 inline h-3 w-3" />
                ) : (
                  <ImageIcon className="mr-1 inline h-3 w-3" />
                )}
                {index + 1}/{media.length}
              </div>
              {renderMobileOverlay(item)}
            </div>
          </CarouselItem>
        ))}
      </CarouselContent>
      <CarouselPrevious className="left-3 border-white/40 bg-background/90 text-foreground hover:bg-background" />
      <CarouselNext className="right-3 border-white/40 bg-background/90 text-foreground hover:bg-background" />
      {lightbox}
    </Carousel>
  );
}
