import { useState } from "react";
import { cn } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/DashboardLayout";
import { useOwnerRestaurants } from "./useOwnerRestaurants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, Percent, Trash2, Edit2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

const APPLIES_TO = [
  { value: "dine_in", label: "Sur place" },
  { value: "takeaway", label: "À emporter" },
  { value: "both", label: "Les deux" },
];

const DAYS_OF_WEEK = [
  { value: "mon", label: "Lun" },
  { value: "tue", label: "Mar" },
  { value: "wed", label: "Mer" },
  { value: "thu", label: "Jeu" },
  { value: "fri", label: "Ven" },
  { value: "sat", label: "Sam" },
  { value: "sun", label: "Dim" },
];

export default function DashboardFormules() {
  const { restaurantIds } = useOwnerRestaurants();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  const { data: formulas, isLoading } = useQuery({
    queryKey: ["dashboard-formulas", restaurantIds],
    queryFn: async () => {
      if (!restaurantIds.length) return [];
      const { data } = await supabase.from("meal_formulas").select("*, meal_formula_categories(*)").in("restaurant_id", restaurantIds).order("created_at", { ascending: false });
      return data || [];
    },
    enabled: restaurantIds.length > 0,
  });

  const toggleActive = async (id: string, current: boolean) => {
    await supabase.from("meal_formulas").update({ is_active: !current }).eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["dashboard-formulas"] });
    toast({ title: current ? "Formule désactivée" : "Formule activée" });
  };

  const deleteFormula = async (id: string) => {
    await supabase.from("meal_formula_categories").delete().eq("formula_id", id);
    await supabase.from("meal_formulas").delete().eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["dashboard-formulas"] });
    toast({ title: "Formule supprimée" });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Percent className="h-6 w-6 text-primary" />
            <h1 className="font-display text-3xl font-bold">Formules & Menus</h1>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => {
              setEditing({ name: "Entrée + Plat", formula_key: "entree_plat", categories: "Entrées, Plats", discount_percent: 15, is_standard: true });
              setOpen(true);
            }}>Std: E+P</Button>
            <Button variant="outline" size="sm" onClick={() => {
              setEditing({ name: "Plat + Dessert", formula_key: "plat_dessert", categories: "Plats, Desserts", discount_percent: 15, is_standard: true });
              setOpen(true);
            }}>Std: P+D</Button>
            <Button variant="outline" size="sm" onClick={() => {
              setEditing({ name: "Entrée + Plat + Dessert", formula_key: "entree_plat_dessert", categories: "Entrées, Plats, Desserts", discount_percent: 20, is_standard: true });
              setOpen(true);
            }}>Std: E+P+D</Button>
            <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) setEditing(null); }}>
              <DialogTrigger asChild><Button className="gap-2"><Plus className="h-4 w-4" /> Nouvelle formule</Button></DialogTrigger>
              <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader><DialogTitle>{editing?.id ? "Modifier la formule" : "Nouvelle formule"}</DialogTitle></DialogHeader>
                <FormulaForm restaurantIds={restaurantIds} initial={editing} onSaved={() => { setOpen(false); setEditing(null); queryClient.invalidateQueries({ queryKey: ["dashboard-formulas"] }); toast({ title: editing?.id ? "Modifiée" : "Formule créée" }); }} />
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-3">{[1, 2].map(i => <div key={i} className="h-24 bg-muted animate-pulse rounded-xl" />)}</div>
        ) : !formulas?.length ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">Aucune formule. Créez des menus combinés avec réductions !</CardContent></Card>
        ) : (
          <div className="space-y-3">
            {formulas.map((f: any) => (
              <Card key={f.id}>
                <CardContent className="flex items-center gap-4 py-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-semibold text-sm">{f.name}</p>
                      <Badge className="bg-primary/10 text-primary text-[10px]">-{f.discount_percent}%</Badge>
                      <Badge variant="outline" className="text-[10px]">{APPLIES_TO.find(a => a.value === f.applies_to)?.label}</Badge>
                      {!f.is_active && <Badge variant="secondary" className="text-[10px]">Inactive</Badge>}
                    </div>
                    {f.description && <p className="text-xs text-muted-foreground truncate">{f.description}</p>}
                    <p className="text-xs text-primary font-medium mt-1">
                      {f.meal_formula_categories?.map((c: any) => c.category).join(" + ")}
                    </p>
                    {f.availability?.days?.length > 0 && (
                      <p className="text-[10px] text-muted-foreground mt-1">
                        Dispo: {f.availability.days.map((d: string) => DAYS_OF_WEEK.find(dw => dw.value === d)?.label).join(", ")} · {f.availability.startTime} - {f.availability.endTime}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={f.is_active} onCheckedChange={() => toggleActive(f.id, f.is_active)} />
                    <Button size="icon" variant="ghost" onClick={() => { setEditing(f); setOpen(true); }}><Edit2 className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" className="text-destructive" onClick={() => deleteFormula(f.id)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

function FormulaForm({ restaurantIds, initial, onSaved }: { restaurantIds: string[]; initial?: any; onSaved: () => void }) {
  const [name, setName] = useState(initial?.name || "");
  const [formulaKey, setFormulaKey] = useState(initial?.formula_key || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [discountPercent, setDiscountPercent] = useState(initial?.discount_percent?.toString() || "10");
  const [appliesTo, setAppliesTo] = useState(initial?.applies_to || "both");
  const [categories, setCategories] = useState<string>(
    initial?.categories || initial?.meal_formula_categories?.map((c: any) => c.category).join(", ") || ""
  );
  const [availability, setAvailability] = useState(initial?.availability || {
    days: ["mon", "tue", "wed", "thu", "fri"],
    startTime: "12:00",
    endTime: "14:30"
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const key = formulaKey || name.toLowerCase().replace(/\s+/g, "_");
    const payload = {
      restaurant_id: initial?.restaurant_id || restaurantIds[0],
      name, formula_key: key, description, discount_percent: Number(discountPercent), applies_to: appliesTo,
      availability, is_standard: !!initial?.is_standard,
    };

    let formulaId = initial?.id;
    if (initial) {
      await supabase.from("meal_formulas").update(payload).eq("id", initial.id);
      await supabase.from("meal_formula_categories").delete().eq("formula_id", initial.id);
    } else {
      const { data } = await supabase.from("meal_formulas").insert(payload).select("id").single();
      formulaId = data?.id;
    }

    if (formulaId && categories.trim()) {
      const cats = categories.split(",").map((c, i) => ({
        formula_id: formulaId!,
        category: c.trim(),
        course_order: i + 1,
      }));
      await supabase.from("meal_formula_categories").insert(cats);
    }

    setLoading(false);
    onSaved();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2"><Label>Nom</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="Menu Midi" required /></div>
      <div className="space-y-2"><Label>Clé (optionnel)</Label><Input value={formulaKey} onChange={e => setFormulaKey(e.target.value)} placeholder="menu_midi" /></div>
      <div className="space-y-2"><Label>Description</Label><Textarea value={description} onChange={e => setDescription(e.target.value)} /></div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2"><Label>Réduction (%)</Label><Input type="number" min="1" max="100" value={discountPercent} onChange={e => setDiscountPercent(e.target.value)} required /></div>
        <div className="space-y-2">
          <Label>S'applique à</Label>
          <Select value={appliesTo} onValueChange={setAppliesTo}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{APPLIES_TO.map(a => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-2">
        <Label>Catégories (séparées par des virgules)</Label>
        <Input value={categories} onChange={e => setCategories(e.target.value)} placeholder="Entrées, Plats, Desserts" />
        <p className="text-[11px] text-muted-foreground">Les catégories doivent correspondre aux catégories de votre menu.</p>
      </div>

      <div className="space-y-3 border-t pt-4">
        <Label className="text-sm font-semibold">Planification (Horaires & Jours)</Label>
        <div className="flex flex-wrap gap-2">
          {DAYS_OF_WEEK.map(day => (
            <label key={day.value} className={cn(
              "flex flex-col items-center justify-center w-10 h-10 rounded-lg border cursor-pointer text-[10px] transition-colors",
              availability.days.includes(day.value) ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"
            )}>
              <input
                type="checkbox"
                className="hidden"
                checked={availability.days.includes(day.value)}
                onChange={() => {
                  const newDays = availability.days.includes(day.value)
                    ? availability.days.filter((d: string) => d !== day.value)
                    : [...availability.days, day.value];
                  setAvailability({ ...availability, days: newDays });
                }}
              />
              {day.label}
            </label>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label className="text-xs">Heure de début</Label>
            <Input type="time" value={availability.startTime} onChange={e => setAvailability({ ...availability, startTime: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Heure de fin</Label>
            <Input type="time" value={availability.endTime} onChange={e => setAvailability({ ...availability, endTime: e.target.value })} />
          </div>
        </div>
      </div>

      <Button type="submit" disabled={loading} className="w-full">{loading ? "Enregistrement..." : (initial?.id ? "Modifier" : "Créer la formule")}</Button>
    </form>
  );
}