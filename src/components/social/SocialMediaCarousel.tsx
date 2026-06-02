import { ImageIcon, Video } from "lucide-react";

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import type { SocialFeedMedia } from "@/lib/socialFeed";
import { cn } from "@/lib/utils";

type SocialMediaCarouselProps = {
  media: SocialFeedMedia[];
  variant?: "default" | "side";
  className?: string;
};

export default function SocialMediaCarousel({ media, variant = "default", className }: SocialMediaCarouselProps) {
  if (!media.length) return null;

  const frameClassName = cn(
    "relative overflow-hidden border bg-muted",
    variant === "side" ? "aspect-[16/10] rounded-2xl shadow-lg shadow-orange-100/60" : "aspect-[4/3] rounded-lg",
  );
  const containerClassName = cn(variant === "side" ? "mt-0" : "mt-4", className);

  const renderMedia = (item: SocialFeedMedia) => {
    if (item.mediaType === "video") {
      return (
        <video
          src={item.mediaUrl}
          controls
          playsInline
          className="h-full w-full bg-black object-cover"
        >
          <track kind="captions" />
        </video>
      );
    }

    return (
      <img
        src={item.mediaUrl}
        alt={item.altText || ""}
        className="h-full w-full object-cover"
        loading="lazy"
      />
    );
  };

  if (media.length === 1) {
    const item = media[0];
    return (
      <div className={cn(containerClassName, frameClassName)}>
        {renderMedia(item)}
        <div className="absolute left-3 top-3 rounded-full bg-black/55 px-2 py-1 text-xs font-medium text-white backdrop-blur">
          {item.mediaType === "video" ? <Video className="mr-1 inline h-3 w-3" /> : <ImageIcon className="mr-1 inline h-3 w-3" />}
          1/1
        </div>
      </div>
    );
  }

  return (
    <Carousel className={containerClassName} opts={{ loop: false }}>
      <CarouselContent className="-ml-2">
        {media.map((item, index) => (
          <CarouselItem key={item.id} className="pl-2">
            <div className={frameClassName}>
              {renderMedia(item)}
              <div className="absolute left-3 top-3 rounded-full bg-black/55 px-2 py-1 text-xs font-medium text-white backdrop-blur">
                {item.mediaType === "video" ? <Video className="mr-1 inline h-3 w-3" /> : <ImageIcon className="mr-1 inline h-3 w-3" />}
                {index + 1}/{media.length}
              </div>
            </div>
          </CarouselItem>
        ))}
      </CarouselContent>
      <CarouselPrevious className="left-3 border-white/40 bg-background/90 text-foreground hover:bg-background" />
      <CarouselNext className="right-3 border-white/40 bg-background/90 text-foreground hover:bg-background" />
    </Carousel>
  );
}
