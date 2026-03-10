import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { DollarSign, Download, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function CourierEarnings() {
    const { user } = useAuth();
    const [earnings, setEarnings] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (user) fetchEarnings();
    }, [user]);

    const fetchEarnings = async () => {
        setLoading(true);
        const { data: courierRow } = await supabase
            .from('couriers')
            .select('id')
            .eq('user_id', user?.id)
            .maybeSingle();

        if (!courierRow) return setLoading(false);

        // Using payment_transactions as primary ledger
        const { data } = await supabase
            .from("payment_transactions" as any)
            .select("*")
            .eq("reference_id", courierRow.id)
            .eq("type", "transfer")
            .order("created_at", { ascending: false });

        setEarnings(data || []);
        setLoading(false);
    };

    const totalEarnings = earnings.reduce((acc, curr) => acc + (curr.amount || 0), 0);

    if (loading) return <div className="p-8 text-center">Chargement des gains...</div>;

    return (
        <div className="container mx-auto p-4 space-y-6 max-w-lg mt-16">
            <div className="flex justify-between items-end">
                <div>
                    <h1 className="text-2xl font-bold">Mes Gains</h1>
                    <p className="text-muted-foreground">Historique des virements</p>
                </div>
                <Button variant="outline" size="sm">
                    <Download className="w-4 h-4 mr-2" /> Export
                </Button>
            </div>

            <Card className="bg-primary text-primary-foreground border-none">
                <CardHeader className="pb-2">
                    <CardDescription className="text-primary-foreground/80">Solde Total (Historique)</CardDescription>
                    <CardTitle className="text-4xl flex items-center">
                        <DollarSign className="w-8 h-8 mr-1" />
                        {totalEarnings.toFixed(2)}
                    </CardTitle>
                </CardHeader>
            </Card>

            <div className="space-y-4">
                <h2 className="font-semibold text-lg flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-muted-foreground" />
                    Transactions
                </h2>
                {earnings.length === 0 ? (
                    <p className="text-muted-foreground text-sm">Aucun virement enregistré pour le moment.</p>
                ) : (
                    earnings.map((earning) => (
                        <div key={earning.id} className="flex justify-between items-center p-4 border rounded-lg bg-card text-card-foreground">
                            <div>
                                <p className="font-medium">Virement {earning.provider || 'Bancaire'}</p>
                                <p className="text-xs text-muted-foreground">{new Date(earning.created_at).toLocaleDateString()}</p>
                            </div>
                            <span className="font-semibold text-green-600">+{earning.amount} {earning.currency || '€'}</span>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
