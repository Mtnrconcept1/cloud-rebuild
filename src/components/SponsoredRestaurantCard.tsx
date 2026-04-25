import RestaurantCard from "./RestaurantCard";

interface SponsoredRestaurantCardProps {
  id: string;
  name: string;
  cuisine: string;
  rating: number;
  reviewCount: number;
  imageUrl: string;
  priceRange: number;
  deliveryAvailable: boolean;
  city: string;
  campaignId: string;
  promoText?: string;
  promoImage?: string;
}

export default function SponsoredRestaurantCard({
  id,
  name,
  cuisine,
  rating,
  reviewCount,
  imageUrl,
  priceRange,
  deliveryAvailable,
  city,
  campaignId,
  promoText,
  promoImage,
}: SponsoredRestaurantCardProps) {
  return (
    <RestaurantCard
      id={id}
      name={name}
      cuisine={cuisine}
      rating={rating}
      reviewCount={reviewCount}
      imageUrl={imageUrl}
      priceRange={priceRange}
      deliveryAvailable={deliveryAvailable}
      city={city}
      sponsoredCampaignId={campaignId}
      sponsoredPromoImage={promoImage}
      sponsoredCampaignTitle={promoText}
    />
  );
}
