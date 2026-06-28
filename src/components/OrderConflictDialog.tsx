import { useNavigate } from "react-router-dom";
import { useCart } from "@/lib/cart-context";
import { useActiveFeatures } from "@/lib/featureFlags";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

export default function OrderConflictDialog() {
  const { conflict, resolveConflict } = useCart();
  const navigate = useNavigate();
  const activeFeatures = useActiveFeatures();
  const multiRestoEnabled = activeFeatures.has("multi-restaurant");
  if (!conflict) return null;
  const isModeConflict = conflict.type === "mode";

  return (
    <AlertDialog open={!!conflict} onOpenChange={(open) => !open && resolveConflict("checkout")}>
      <AlertDialogContent className="rounded-2xl border-2">
        <AlertDialogHeader>
          <AlertDialogTitle className="font-display text-xl font-bold">{isModeConflict ? "Mode de livraison différent" : "Restaurant différent"}</AlertDialogTitle>
          <AlertDialogDescription className="text-sm">{isModeConflict ? `Vous avez déjà des produits en ${conflict.pendingMode === "delivery" ? "emporter" : "livraison"} dans votre panier.` : "Vous avez déjà des produits d'un autre restaurant dans votre panier."}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-start sm:space-x-0">
          {!isModeConflict && multiRestoEnabled && <AlertDialogAction onClick={() => { resolveConflict("clear"); navigate("/multi-restaurant"); }} className="w-full sm:w-auto rounded-xl bg-pink-500 hover:bg-pink-600 font-bold whitespace-normal text-center h-auto py-2.5">Option Multi-Resto</AlertDialogAction>}
          <AlertDialogCancel onClick={() => resolveConflict("clear")} className="w-full sm:w-auto rounded-xl border-2 hover:bg-destructive hover:text-destructive-foreground hover:border-destructive transition-all whitespace-normal text-center h-auto py-2.5">Nouvelle commande</AlertDialogCancel>
          <AlertDialogAction onClick={() => { resolveConflict("checkout"); navigate("/panier"); }} className="w-full sm:w-auto rounded-xl bg-primary hover:bg-primary/90 font-bold whitespace-normal text-center h-auto py-2.5">Finaliser la commande</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
