import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { BadgePercent, ChevronRight, Compass, Heart, MapPinned, MoonStar, ShoppingCart, Sparkles, SunMedium, Timer, TrendingUp, UserRound, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import PromoCarousel from "@/components/PromoCarousel";
import LoyaltyStatus from "@/components/LoyaltyStatus";
import CampaignBanner from "@/components/CampaignBanner";
import HeroSection from "@/components/home/HeroSection";
import CuisineCategoryStrip from "@/components/home/CuisineCategoryStrip";
import SolidaritySection from "@/components/home/SolidaritySection";
import RestaurantSection from "@/components/home/RestaurantSection";
import SectionShowcaseHeader from "@/components/home/SectionShowcaseHeader";
import FeaturesSection from "@/components/home/FeaturesSection";
import { getSupabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useCart } from "@/lib/cart-context";
import { useActiveFeatures } from "@/lib/featureFlags";
import { getCurrentPosition } from "@/lib/geolocation-native";
import {
  isRestaurantWithinRadius,
  type Coordinates,
} from "@/lib/nearbyRestaurants";
import { useCommercialDemoFrame } from "@/components/commercial/CommercialDemoFr¶»§q«^