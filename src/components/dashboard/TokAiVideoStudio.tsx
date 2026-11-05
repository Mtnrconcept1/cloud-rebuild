import RestaurantReelCreator, { type RestaurantReelCreatorProps } from "./RestaurantReelCreator";

export default function TokAiVideoStudio(props: RestaurantReelCreatorProps) {
  return <RestaurantReelCreator key={props.restaurantId} {...props} />;
}
