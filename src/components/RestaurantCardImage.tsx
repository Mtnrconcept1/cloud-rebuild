import { useState } from "react";
import { getOptimizedImageSizes, getOptimizedImageSrcSet, getOptimizedImageUrl } from "@/lib/optimizedImages";
import { normalizePublicImageUrl } from "@/lib/securityUrls";

const PLACEHOLDER = "/images/tok-restaurant-placeholder.svg";

type RestaurantCardImageProps = {
  imageUrl: string | null | undefined;
  name: string;
  className?: string;
};

function ImageSources({ imageUrl, name, className }: RestaurantCardImageProps & { imageUrl: string }) {
  const [sourceIndex, setSourceIndex] = useState(0);
  const sources = [...new Set([
    getOptimizedImageUrl(imageUrl, "card") || imageUrl || PLACEHOLDER,
    imageUrl,
    PLACEHOLDER,
  ])];
  const srcSet = sourceIndex === 0 ? getOptimizedImageSrcSet(imageUrl, "card") : undefined;

  return (
    <img
      src={sources[sourceIndex]}
      srcSet={srcSet}
      sizes={srcSet ? getOptimizedImageSizes("card") : undefined}
      width={640}
      height={400}
      alt={name}
      className={className}
      loading="lazy"
      decoding="async"
      onError={() => setSourceIndex((index) => Math.min(index + 1, sources.length - 1))}
    />
  );
}

export default function RestaurantCardImage(props: RestaurantCardImageProps) {
  const imageUrl = normalizePublicImageUrl(props.imageUrl, PLACEHOLDER);
  return <ImageSources {...props} key={imageUrl} imageUrl={imageUrl} />;
}
