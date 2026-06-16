import { type ReactNode, useEffect, useRef, useState } from "react";
import { ImageIcon, Video } from "lucide-react";

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { isVerticalSocialVideoDimensions } from "@/lib/media/socialMediaCompression";
import { getOptimizedImageSizes, getOptimizedImageSrcSet, getOptimizedImageUrl } from "@/lib/optimizedImages";
import type { SocialFeedMedia } from "@/lib/socialFeed";
import { cn } from "@/lib/utils";

type SocialMediaCarouselProps = {
  media: SocialFeedMedia[];
  variant?: "default" | "side";
  className?: string;
  mobileOverlay?: ReactNode;
  mobileBleed?: "viewport" | "container" | false;
};

function AutoPlayOnViewVideo({
  item,
  className,
  onLoadedMetadata,
  onPlaybackChange,
}: {
  item: SocialFeedMedia;
  className?: string;
  onLoadedMetadata: (video: HTMLVideoElement) => void;
  onPlaybackChange: (playing: boolean) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || typeof window === "undefined" || !("IntersectionObserver" in window)) return;

    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
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
}: SocialMediaCarouselProps) {
  const [verticalVideoIds, setVerticalVideoIds] = useState<Set<string>>(() => new Set());
  const [playingVideoIds, setPlayingVideoIds] = useState<Set<string>>(() => new Set());

  if (!media.length) return null;

  const frameClassName = cn(
    "relative overflow-hidden border bg-muted",
    variant === "side"
      ? "aspect-[16/9] min-h-0 rounded-[1.45rem] shadow-xl shadow-orange-100/70 max-sm:rounded-[1.35rem] max-sm:border-0 max-sm:shadow-none sm:min-h-[16rem]"
      : "aspect-[4/3] rounded-lg",
  );
  const containerClassName = cn(variant === "side" ? "mt-0" : "mt-4", className);
  const imagePreset = variant === "side" ? "hero" : "card";
  const isVerticalVideo = (item: SocialFeedMedia) => item.mediaType === "video" && verticalVideoIds.has(item.id);
  const getContainerClassName = (item: SocialFeedMedia) => cn(
    containerClassName,
    variant === "side" && mobileBleed === "viewport" && "max-sm:-mx-6 max-sm:w-screen",
    variant === "side" && mobileBleed === "container" && "max-sm:-mx-4 max-sm:w-[calc(100%+2rem)]",
  );
  const getFrameClassName = (item: SocialFeedMedia) => cn(
    frameClassName,
    variant === "side" && "max-sm:rounded-none",
    variant === "side" && isVerticalVideo(item) && "max-sm:aspect-[5/6]",
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

    const shouldHideOverlay = item.mediaType === "video" && playingVideoIds.has(item.id);

    return (
      <div
        className={cn(
          "transition-opacity duration-200",
          shouldHideOverlay && "max-sm:pointer-events-none max-sm:opacity-0",
        )}
        data-media-overlay-state={shouldHideOverlay ? "hidden-while-playing" : "visible"}
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
          className="h-full w-full bg-black object-cover"
          onLoadedMetadata={(video) => {
            if (!isVerticalSocialVideoDimensions(video.videoWidth, video.videoHeight)) return;
            setVerticalVideoIds((current) => {
              if (current.has(item.id)) return current;
              const next = new Set(current);
              next.add(item.id);
              return next;
            });
          }}
          onPlaybackChange={(playing) => updateVideoPlayback(item.id, playing)}
        />
      );
    }

    return (
      <img
        src={getOptimizedImageUrl(item.mediaUrl, imagePreset)}
        srcSet={getOptimizedImageSrcSet(item.mediaUrl, imagePreset)}
        sizes={getOptimizedImageSizes(imagePreset)}
        alt={item.altText || ""}
        className="h-full w-full object-cover"
        loading="lazy"
        decoding="async"
      />
    );
  };

  if (media.length === 1) {
    const item = media[0];
    return (
      <div className={cn(getContainerClassName(item), getFrameClassName(item))}>
        {renderMedia(item)}
        <div className="absolute left-3 top-3 rounded-full bg-black/55 px-2 py-1 text-xs font-medium text-white backdrop-blur">
          {item.mediaType === "video" ? <Video className="mr-1 inline h-3 w-3" /> : <ImageIcon className="mr-1 inline h-3 w-3" />}
          1/1
        </div>
        {renderMobileOverlay(item)}
      </div>
    );
  }

  return (
    <Carousel className={containerClassName} opts={{ loop: false }}>
      <CarouselContent className="-ml-2">
        {media.map((item, index) => (
          <CarouselItem key={item.id} className={cn("pl-2", variant === "side" && isVerticalVideo(item) && "max-sm:pl-0")}>
            <div className={getFrameClassName(item)}>
              {renderMedia(item)}
              <div className="absolute left-3 top-3 rounded-full bg-black/55 px-2 py-1 text-xs font-medium text-white backdrop-blur">
                {item.mediaType === "video" ? <Video className="mr-1 inline h-3 w-3" /> : <ImageIcon className="mr-1 inline h-3 w-3" />}
                {index + 1}/{media.length}
              </div>
              {renderMobileOverlay(item)}
            </div>
          </CarouselItem>
        ))}
      </CarouselContent>
      <CarouselPrevious className="left-3 border-white/40 bg-background/90 text-foreground hover:bg-background" />
      <CarouselNext className="right-3 border-white/40 bg-background/90 text-foreground hover:bg-background" />
    </Carousel>
  );
}
