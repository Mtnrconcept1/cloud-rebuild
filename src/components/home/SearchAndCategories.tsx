import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, UtensilsCrossed, Pizza, Flame, Coffee, Salad, IceCream } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { trackEvent } from "@/lib/analytics";

const CATEGORIES = [
  { label: "Tout", icon: UtensilsCrossed, query: "" },
  { label: "Pizza", icon: Pizza, query: "pizza" },
  { label: "Burgers", icon: Flame, query: "burger" },
  { label: "Café", icon: Coffee, query: "café" },
  { label: "Salades", icon: Salad, query: "salade" },
  { label: "Desserts", icon: IceCream, query: "dessert" },
];

export default function SearchAndCategories() {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("");
  const navigate = useNavigate();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    navigate(searchQuery.trim() ? `/recherche?q=${encodeURIComponent(searchQuery)}` : "/recherche");
  };

  const handleCategoryClick = (query: string) => {
    setActiveCategory(query);
    if (query) {
      trackEvent({ eventType: "category_click", eventData: { category: query } });
      navigate(`/recherche?q=${encodeURIComponent(query)}`);
    }
  };

  return (
    <section className="sticky top-16 z-30 bg-background pb-4 border-b">
      <div className="container space-y-4 pt-4">
        <form onSubmit={handleSearch} className="flex items-center gap-2 max-w-2xl mx-auto bg-card rounded-2xl shadow-lg border-2 border-primary/5 p-1.5 focus-within:border-primary/20 transition-all">
          <div className="flex items-center gap-2 text-muted-foreground pl-3">
            <Search className="h-5 w-5 shrink-0 text-primary" />
          </div>
          <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Envie de sushi, pizza ou d'un burger ?" className="border-0 shadow-none focus-visible:ring-0 bg-transparent text-base" />
          <Button type="submit" size="lg" className="shrink-0 rounded-xl px-6 font-bold">Trouver</Button>
        </form>

        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide px-4 justify-center">
          {CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            const isActive = activeCategory === cat.query;
            return (
              <button key={cat.label} onClick={() => handleCategoryClick(cat.query)} className={`flex items-center gap-2 px-6 py-2.5 rounded-2xl shrink-0 transition-all text-sm font-bold ${isActive ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20 scale-105" : "bg-secondary/50 hover:bg-secondary text-muted-foreground hover:text-foreground"}`}>
                <Icon className="h-4 w-4" />
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
