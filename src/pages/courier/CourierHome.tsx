import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MapPin, Navigation, DollarSign, Clock, ShieldCheck } from "lucide-react";

export default function CourierHome() {
    const { user } = useAuth();
    const [profile, setProfile] = useState<any>(null);
    const [isOnline, setIsOnline] = useState(false);

    useEffect(() => {
        if (user) {
            fetchCourierProfile();
        }
    }, [user]);

    const fetchCourierProfile = async () => {
        const { data } = await supabase
            .from("couriers")
            .select("*")
            .eq("user_id", user?.id)
            .maybeSingle();

        if (data) {
            setProfile(data);
            setIsOnline(data.is_online || false);
        }
    };

    const toggleOnlineStatus = async () => {
        if (!profile) return;
        const newStatus = !isOnline;
        setIsOnline(newStatus);

        await supabase
            .from("couriers")
            .update({
                is_online: newStatus,
                status: newStatus ? 'available' : 'offline'
            })
            .eq("id", profile.id);
    };

    return (
        <div className="container mx-auto p-4 space-y-6 max-w-lg mt-16">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Livreur App</h1>
                    <p className="text-muted-foreground">Bonjour {user?.email}</p>
                </div>
                <Button
                    variant={isOnline ? "destructive" : "default"}
                    onClick={toggleOnlineStatus}
                >
                    {isOnline ? "Passer Hors Ligne" : "Passer En Ligne"}
                </Button>
            </div>

            <div className="grid gap-4">
                {isOnline && (
                    <Card className="border-green-500 bg-green-50 dark:bg-green-900/10">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-lg flex items-center gap-2">
                                <Navigation className="h-5 w-5 text-green-600" />
                                Prêt pour les commandes
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-muted-foreground">En attente d'une mission de livraison près de votre position.</p>
                        </CardContent>
                    </Card>
                )}

                <div className="grid grid-cols-2 gap-4">
                    <Card>
                        <CardHeader className="pb-2">
                            <CardDescription>Gains (Aujourd'hui)</CardDescription>
                            <CardTitle className="text-2xl flex items-center">
                                <DollarSign className="h-5 w-5 mr-1" />
                                0.00
                            </CardTitle>
                        </CardHeader>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardDescription>Missions</CardDescription>
                            <CardTitle className="text-2xl flex items-center">
                                <MapPin className="h-5 w-5 mr-1" />
                                0
                            </CardTitle>
                        </CardHeader>
                    </Card>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>Mes Statistiques</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex justify-between items-center">
                            <div className="flex items-center gap-2">
                                <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                                <span>Taux d'acceptation</span>
                            </div>
                            <span className="font-semibold">{profile?.acceptance_rate || 100}%</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <div className="flex items-center gap-2">
                                <Clock className="h-4 w-4 text-muted-foreground" />
                                <span>Temps moyen par livraison</span>
                            </div>
                            <span className="font-semibold">{profile?.avg_delivery_time || 0} min</span>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
