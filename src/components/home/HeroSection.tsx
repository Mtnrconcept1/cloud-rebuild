import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, ChefHat, Heart, Mail, MapPin, Navigation, Percent, Search, ShoppingBag, Users } from "lucide-react";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth-context";
import "./HeroSection.css";

const HERO_IMAGE_FETCH_PRIORITY_PROPS = { fetchpriority: "high" } as const;
const NO_FEATURES: ReadonlySet<string> = new Set();

const newsletterConditions = [
  "Le bonus de bienvenue est réservé aux nouveaux comptes TOK qui s'inscrivent à la newsletter depuis cette offre.",
  "Les 500 Miamz sont crédités une seule fois par personne après validation du compte et de l'inscription à la newsletter.",
  "Les Miamz ne sont pas convertibles en argent et s'utilisent uniquement dans les parcours TOK éligibles, selon les règles affichées dans l'application.",
  "Vous pouvez vous désinscrire de la newsletter à tout moment. La désinscription n'annule pas les Miamz déjà crédités, sauf fraude, abus ou erreur technique.",
  "TOK peut modifier, suspendre ou arrêter l'offre si nécessaire, notamment en cas d'usage abusif, de comptes multiples ou de tentative de contournement.",
];

type HeroSectionProps = {
  contentVisible?: boolean;
  activeFeatures?: ReadonlySet<string>;
};

export default function HeroSection({ contentVisible = true, activeFeatures = NO_FEATURES }:���q�^