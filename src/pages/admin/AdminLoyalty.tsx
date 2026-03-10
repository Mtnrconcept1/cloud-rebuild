import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Crown, HeartHandshake, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AdminLoyalty() {
    const { data: tiers } = useQuery({
        queryKey: ["admin-loyalty-tiers"],
        queryFn: async () => {
            const { data } = await supabase.from("loyalty_tiers").select("*").order("min_points");
            return data || [];
        }
    });

    const { data: subscriptionPlans } = useQuery({
        queryKey: ["admin-subscription-plans"],
        queryFn: async () => {
            const { data } = await supabase.from("user_subscription_plans").select("*");
            return data || [];
        }
    });

    return (
        <div className="container py-8 space-y-6">
            <div>
                <h1 className="font-display text-3xl font-bold">Fidélité & Abonnement</h1>
                <p className="text-muted-foreground">Configuration du programme Miamz+ et des Paliers de Fidélité (Uber One parity).</p>
            </div>

            <div className="grid lg:grid-cols-2 gap-6">
                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <ShieldCheck className="w-5 h-5 text-primary" />
                                <CardTitle>Abonnements (Miamz+)</CardTitle>
                            </div>
                            <Button variant="outline" size="sm">Créer Forfait</Button>
                        </div>
                        <CardDescription>Forfaits de livraison gratuite et remises partenaires (Miamz+)</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {subscriptionPlans?.map(plan => (
                            <div key={plan.id} className="p-4 border rounded-xl flex justify-between items-center">
                                <div>
                                    <p className="font-bold text-lg">{plan.name}</p>
                                    <p className="text-sm text-muted-foreground">{plan.price_monthly || 0} € / mois</p>
                                </div>
                                <div className="text-right">
                                    {(plan.free_delivery_min_order ?? 0) > 0 ? (
                                        <p className="text-xs font-semibold text-green-600">Livraison 0€ (dès {plan.free_delivery_min_order}€)</p>
                                    ) : (
                                        <p className="text-xs font-semibold text-green-600">Livraison 0€</p>
                                    )}
                                </div>
                            </div>
                        ))}
                        {(!subscriptionPlans || subscriptionPlans.length === 0) && <p className="text-sm text-muted-foreground">Aucun abonnement configuré.</p>}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Crown className="w-5 h-5 text-amber-500" />
                                <CardTitle>Paliers de Fidélité</CardTitle>
                            </div>
                            <Button variant="outline" size="sm">Ajouter Palier</Button>
                        </div>
                        <CardDescription>Paliers de points et récompenses associées (Gains / Multiplicateurs)</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {tiers?.map(tier => (
                            <div key={tier.id} className="p-4 border rounded-xl bg-gradient-to-tr from-card to-muted/50">
                                <div className="flex justify-between items-center">
                                    <p className="font-bold capitalize">{tier.name}</p>
                                    <span className="text-sm bg-primary text-primary-foreground px-2 py-0.5 rounded-full">
                                        Dès {tier.min_points} Pts
                                    </span>
                                </div>
                                <div className="mt-2 text-sm text-muted-foreground">
                                    Multiplicateur: x{tier.multiplier} points
                                </div>
                            </div>
                        ))}
                        {(!tiers || tiers.length === 0) && <p className="text-sm text-muted-foreground">Aucun palier configuré.</p>}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
