import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Toggle } from "@/components/ui/toggle";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Users, MapPin, UtensilsCrossed, ShoppingCart, Clock, Heart, TrendingUp } from "lucide-react";
import { type AudienceCriteria, DEFAULT_AUDIENCE_CRITERIA, getAudienceEstimate } from "@/lib/analytics";

const CUISINE_OPTIONS = ["Pizza", "Burger", "Sushi", "Thaï", "Indien", "Libanais", "Mexicain", "Chinois", "Français", "Italien", "Végétarien", "Desserts"];

interface AudienceTargetingProps { criteria: AudienceCriteria; onChange: (criteria: AudienceCriteria) => void; restaurantId?: string; }

export default function AudienceTargeting({ criteria, onChange, restaurantId }: AudienceTargetingProps) {
  const [estimate, setEstimate] = useState<number>(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const timer = setTimeout(async () => { setLoading(true); const est = await getAudienceEstimate({ ...criteria, restaurantId }); setEstimate(est); setLoading(false); }, 500);
    return () => clearTimeout(timer);
  }, [criteria, restaurantId]);

  const toggleCuisine = (cuisine: string) => {
    const cuisines = criteria.cuisines.includes(cuisine) ? criteria.cuisines.filter((c) => c !== cuisine) : [...criteria.cuisines, cuisine];
    onChange({ ...criteria, cuisines });
  };

  return (
    <div className="space-y-4">
      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-primary/10"><Users className="h-5 w-5 text-primary" /></div>
            <div><p className="text-sm font-medium">Audience estimée</p><p className="text-xs text-muted-foreground">Clients correspondant à vos critères</p></div>
          </div>
          <div className="text-right"><p className="text-2xl font-bold text-primary">{loading ? "..." : estimate.toLocaleString("fr-FR")}</p><p className="text-xs text-muted-foreground">clients ciblés</p></div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><UtensilsCrossed className="h-4 w-4" /> Cuisines préférées</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">{CUISINE_OPTIONS.map((cuisine) => <Toggle key={cuisine} pressed={criteria.cuisines.includes(cuisine.toLowerCase())} onPressedChange={() => toggleCuisine(cuisine.toLowerCase())} variant="outline" size="sm" className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">{cuisine}</Toggle>)}</div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><MapPin className="h-4 w-4" /> Localisation</CardTitle></CardHeader>
        <CardContent><Input placeholder="Genève, Lausanne, Zurich..." value={criteria.cities.join(", ")} onChange={(e) => onChange({ ...criteria, cities: e.target.value.split(",").map((c) => c.trim()).filter(Boolean) })} /></CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><ShoppingCart className="h-4 w-4" /> Fréquence de commande</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2"><div className="flex items-center justify-between"><Label className="text-xs">Minimum de commandes</Label><Badge variant="outline">{criteria.minOrders}+</Badge></div><Slider value={[criteria.minOrders]} onValueChange={([v]) => onChange({ ...criteria, minOrders: v })} max={50} step={1} /></div>
          <div className="space-y-2"><div className="flex items-center justify-between"><Label className="text-xs">Panier moyen minimum</Label><Badge variant="outline">{criteria.minAvgBasket} CHF</Badge></div><Slider value={[criteria.minAvgBasket]} onValueChange={([v]) => onChange({ ...criteria, minAvgBasket: v })} max={100} step={5} /></div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Clock className="h-4 w-4" /> Réengagement</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2"><div className="flex items-center justify-between"><Label className="text-xs">Dernière commande dans les</Label><Badge variant="outline">{criteria.maxDaysSinceOrder} jours</Badge></div><Slider value={[criteria.maxDaysSinceOrder]} onValueChange={([v]) => onChange({ ...criteria, maxDaysSinceOrder: v })} min={7} max={365} step={7} /></div>
          <div className="flex items-center justify-between"><div className="flex items-center gap-2"><Heart className="h-4 w-4 text-red-500" /><Label className="text-xs">Uniquement mes fans (favoris)</Label></div><Switch checked={criteria.favoritesOnly} onCheckedChange={(v) => onChange({ ...criteria, favoritesOnly: v })} /></div>
        </CardContent>
      </Card>
    </div>
  );
}
