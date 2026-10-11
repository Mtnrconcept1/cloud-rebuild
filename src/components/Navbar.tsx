import { type MouseEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Bell,
  Calculator,
  CalendarDays,
  ChefHat,
  Crown,
  Gift,
  Layers,
  Leaf,
  LogOut,
  Menu,
  Network,
  Newspaper,
  Repeat,
  Route,
  Search,
  Shield,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Store,
  Timer,
  User,
  Users,
  Zap,
} from "lucide-react";

import "@/components/home/HomeNavigation.css";
import ChefHelpButton from "@/components/help/ChefHelpButton";
import NotificationBell from "@/components/notifications/NotificationBell";
import NotificationMenuBadge from "@/components/notifications/NotificationMenuBadge";
import RoleSpaceMenuSection from "@/components/navigation/RoleSpaceMenuSection";
import ThemeToggleButton from "@/components/theme/ThemeToggleButton";
import { useAuth } from "@/lib/auth-context";
import { useCart } from "@/lib/cart-context";
import { useActiveFeatures } from "@/lib/featureFlags";
import { useNotificationCenter } from "@/hooks/useNotificationCenter";
import { useTokLogoSrc } from "@/hooks/useTokLogo";
import { canShowClientSurface, canShowSocialFeedSurface, getRoleHomePath } from "@/lib/roleAccess";
import { getCommercialNavigationHref } from "@/lib/commercialDomains";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@¶»§q«^