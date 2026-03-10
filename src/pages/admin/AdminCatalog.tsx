import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Plus, Tag, Layers } from "lucide-react";

export default function AdminCatalog() {
    const [newCuisine, setNewCuisine] = useState("");

    const { data: cuisines, refetch: refetchCuisines } = useQuery({
        queryKey: ["admin-cuisines"],
        queryFn: async () => {
            const { data } = await supabase.from("cuisines").select("*").order("name");
            return data || [];
        }
    });

    const { data: collections } = useQuery({
        queryKey: ["admin-collections"],
        queryFn: async () => {
            const { data } = await supabase.from("collections").select("*").order("title");
            return data || [];
        }
    });

    const handleAddCuisine = async () => {
        if (!newCuisine.trim()) return;
        const { error } = await supabase.from("cuisines").insert({
            name: newCuisine,
            slug: newCuisine.toLowerCase().replace(/[^a-z0-9]+/g, '-')
        });

        if (error) {
            toast.error("Erreur lors de l'ajout de la cuisine");
            return;
        }
        toast.success("Cuisine ajoutée");
        setNewCuisine("");
        refetchCuisines();
    };

    return (
        <div className="container py-8 space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="font-display text-3xl font-bold">Catalogue Global</h1>
                    <p className="text-muted-foreground">Gérez les cuisines, filtres et collections pour l'algorithme de découverte.</p>
                </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
                <Card>
                    <CardHeader>
                        <div className="flex items-center gap-2">
                            <Tag className="w-5 h-5 text-primary" />
                            <CardTitle>Cuisines (Filtres)</CardTitle>
                        </div>
                        <CardDescription>Tags globaux assignables aux restaurants</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex gap-2">
                            <Input
                                placeholder="Nouvelle spécialité..."
                                value={newCuisine}
                                onChange={e => setNewCuisine(e.target.value)}
                            />
                            <Button onClick={handleAddCuisine}><Plus className="w-4 h-4" /></Button>
                        </div>

                        <div className="flex flex-wrap gap-2 mt-4">
                            {cuisines?.map(cuisine => (
                                <div key={cuisine.id} className="bg-secondary text-secondary-foreground px-3 py-1 rounded-full text-sm">
                                    {cuisine.name}
                                </div>
                            ))}
                            {(!cuisines || cuisines.length === 0) && <p className="text-sm text-muted-foreground">Aucune cuisine définie.</p>}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <div className="flex items-center gap-2">
                            <Layers className="w-5 h-5 text-amber-500" />
                            <CardTitle>Collections à la Une</CardTitle>
                        </div>
                        <CardDescription>Carrousels thématiques de la page d'accueil (ex: "Sain et Rapide")</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <Button variant="outline" className="w-full"><Plus className="w-4 h-4 mr-2" /> Créer une collection</Button>

                        <div className="space-y-2 mt-4">
                            {collections?.map(col => (
                                <div key={col.id} className="border p-3 rounded-lg flex justify-between items-center">
                                    <div>
                                        <p className="font-semibold">{col.title}</p>
                                        <p className="text-xs text-muted-foreground">{col.description}</p>
                                    </div>
                                    <span className={`px-2 py-1 text-xs rounded-full ${col.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100'}`}>
                                        {col.is_active ? 'Actif' : 'Inactif'}
                                    </span>
                                </div>
                            ))}
                            {(!collections || collections.length === 0) && <p className="text-sm text-muted-foreground">Aucune collection définie.</p>}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
