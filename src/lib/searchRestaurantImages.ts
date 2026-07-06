import { getSupabase } from "@/integrations/supabase/client";

export type SearchRestaurantImageResult = {
  id: string;
  restaurant_id: string;
  public_url: string | null;
  storage_path: string;
  description: string | null;
  alt_text: string | null;
  seo_title: string | null;
  seo_description: string | null;
  detected_objects: string[];
  food_items: string[];
  ingredients: string[];
  cuisine_types: string[];
  moods: string[];
  hashtags: string[];
  image_type: string | null;
  quality_score: number | null;
  rank: number;
  created_at: string;
};

export type MatchRestaurantImageResult = Omit<
  SearchRestaurantImageResult,
  "seo_description" | "detected_objects" | "moods" | "image_type" | "quality_score" | "rank" | "created_at"
> & {
  similarity: number;
};

export async function searchRestaurantImages(input: {
  query: string;
  restaurantId?: string | null;
  limit?: number;
  offset?: number;
}) {
  const supabase = getSupabase() as any;
  const { data, error } = await supabase.rpc("search_restaurant_images", {
    p_query: input.query,
    p_restaurant_id: input.restaurantId || null,
    p_limit: input.limit ?? 40,
    p_offset: input.offset ?? 0,
  });

  if (error) {
    throw new Error(`Recherche images impossible: ${error.message}`);
  }

  return (data || []) as SearchRestaurantImageResult[];
}

export async function matchRestaurantImages(input: {
  embedding: number[];
  restaurantId?: string | null;
  matchThreshold?: number;
  matchCount?: number;
}) {
  if (!Array.isArray(input.embedding) || input.embedding.length !== 384) {
    throw new Error("Embedding image invalide.");
  }

  const supabase = getSupabase() as any;
  const { data, error } = await supabase.rpc("match_restaurant_images", {
    p_embedding: `[${input.embedding.join(",")}]`,
    p_match_threshold: input.matchThreshold ?? 0.65,
    p_match_count: input.matchCount ?? 30,
    p_restaurant_id: input.restaurantId || null,
  });

  if (error) {
    throw new Error(`Recherche visuelle impossible: ${error.message}`);
  }

  return (data || []) as MatchRestaurantImageResult[];
}
