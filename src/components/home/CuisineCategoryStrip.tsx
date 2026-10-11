import { useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, Utensils } from "lucide-react";

import SectionShowcaseHeader from "@/components/home/SectionShowcaseHeader";

type CuisineCategory = {
  slug: string;
  label: string;
  imageSrc: string;
};

const CUISINE_CATEGORIES: CuisineCategory[] = [
  { slug: "gastronomique", label: "Gastronomique", imageSrc: "/images/miniatures/12_gastronomique.png" },
  { slug: "italien", label: "Italien", imageSrc: "/images/miniatures/17_italien.png" },
  { slug: "pizza", label: "Pizza", imageSrc: "/images/miniatures/25_pizza.png" },
  { slug: "sushi", label: "Sushi", imageSrc: "/images/miniatures/26_sushi.png" },
  { slug: "bistro", label: "Bistro", imageSrc: "/images/miniatures/03_bistro.png" },
  { slug: "burger", label: "Burger", imageSrc: "/images/miniatures/06_burger.png" },
  { slug: "japonais", label: "Japonais", imageSrc: "/images/miniatures/18_japonais.png" },
  { slug: "francais", label: "FranÃ§ais", imageSrc: "/images/miniatures/11_francais.png" },
  { slug: "ramen", label: "Ramen", imageSrc: "/images/miniatures/27_ramen.png" },
  { slug: "chinois", label: "Chinois", imageSrc: "/images/miniatures/08_chinois.png" },
  { slug: "thai", label: "ThaÃ¯", imageSrc: "/images/miniatures/28_thai.png" },
  { slug: "indien", label: "Indien", imageSrc: "/images/miniatures/16_indien.png" },
  { slug: "libanais", label: "Libanais", imageSrc: "/images/miniatures/20_libanais.png" },
  { sl¶»§q«^