import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { User, LogOut } from "lucide-react";

export default function CourierProfile() {
    const { user, signOut } = useAuth();
    const [profile, setProfile] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (user) fetchProfile();
    }, [user]);

    const fetchProfile = async () => {
        setLoading(true);
        const { data } = await supabase
            .from('couriers')
            .select('*')
            .eq('user_id', user?.id)
            .maybeSingle();
        setProfile(data || {});
        setLoading(false);
    };

    const updateProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!profile?.id) return;

        // Simulate updating specific details
        const { error } = await supabase
            .from("couriers")
            .update({ vehicle_type: profile.vehicle_type })
            .eq("id", profile.id);

        if (error) {
            toast.error("Erreur lors de la mise à jour");
        } else {
            toast.success("Profil mis à jour");
        }
    };

    if (loading) return <div className="p-8 text-center">Chargement...</div>;

    return (
        <div className="container mx-auto p-4 space-y-6 max-w-lg mt-16">
            <div className="flex items-center gap-3">
                <div className="bg-primary/10 p-3 rounded-full">
                    <User className="h-6 w-6 text-primary" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold">Mon Profil</h1>
                    <p className="text-sm text-muted-foreground">{user?.email}</p>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Détails du compte Livreur</CardTitle>
                    <CardDescription>Informations de votre flotte et de votre compte Miamz</CardDescription>
                </CardHeader>
                <CardContent>
                    <form className="space-y-4" onSubmit={updateProfile}>
                        <div className="space-y-2">
                            <Label htmlFor="vehicle_type">Type de véhicule</Label>
                            <Input
                                id="vehicle_type"
                                value={profile?.vehicle_type || ''}
                                onChange={(e) => setProfile({ ...profile, vehicle_type: e.target.value })}
                                placeholder="ex: Vélo, Scooter, Voiture"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label>Statut d'approbation</Label>
                            <Input disabled value={profile?.status || 'En attente'} className="bg-muted" />
                        </div>

                        <Button type="submit" className="w-full">Sauvegarder les modifications</Button>
                    </form>
                </CardContent>
            </Card>

            <Button variant="destructive" className="w-full mt-8" onClick={signOut}>
                <LogOut className="w-4 h-4 mr-2" />
                Déconnexion
            </Button>
        </div>
    );
}
