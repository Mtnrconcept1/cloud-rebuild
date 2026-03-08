import { useCart } from "@/lib/cart";
import { Button } from "@/components/ui/button";
import { Minus, Plus, Trash2, ShoppingBag } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function Panier() {
  const { items, updateQuantity, removeItem, total, clearCart } = useCart();
  const navigate = useNavigate();

  if (items.length === 0) {
    return (
      <main className="container mx-auto px-4 py-20 text-center space-y-4">
        <ShoppingBag className="mx-auto h-16 w-16 text-muted-foreground" />
        <h1 className="text-2xl font-bold">Votre panier est vide</h1>
        <p className="text-muted-foreground">Explorez nos restaurants pour ajouter des plats.</p>
        <Button onClick={() => navigate("/recherche")}>Parcourir les restaurants</Button>
      </main>
    );
  }

  return (
    <main className="container mx-auto px-4 py-8 max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Mon panier</h1>
      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.menuItemId} className="flex items-center gap-4 p-4 border rounded-xl bg-card">
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm truncate">{item.name}</p>
              <p className="text-sm text-primary font-bold">{item.price.toFixed(2)} CHF</p>
            </div>
            <div className="flex items-center gap-2">
              <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => updateQuantity(item.menuItemId, item.quantity - 1)}><Minus className="h-3 w-3" /></Button>
              <span className="w-6 text-center text-sm font-medium">{item.quantity}</span>
              <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => updateQuantity(item.menuItemId, item.quantity + 1)}><Plus className="h-3 w-3" /></Button>
              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => removeItem(item.menuItemId)}><Trash2 className="h-3 w-3" /></Button>
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between p-4 border rounded-xl bg-card font-bold text-lg">
        <span>Total</span>
        <span className="text-primary">{total.toFixed(2)} CHF</span>
      </div>
      <Button className="w-full h-12 text-lg font-bold">Commander</Button>
    </main>
  );
}
