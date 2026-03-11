import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Plus, Tag, Layers, Trash2, Pencil } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

type CollectionFormState = {
  title: string;
  description: string;
  image_url: string;
  is_active: boolean;
  restaurant_ids: string[];
};

const EMPTY_COLLECTION_FORM: CollectionFormState = {
  title: "",
  description: "",
  image_url: "",
  is_active: true,
  restaurant_ids: [],
};

export default function AdminCatalog() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newCuisine, setNewCuisine] = useState("");
  const [collectionOpen, setCollectionOpen] = useState(false);
  const [editingCollection, setEditingCollection] = useState<any>(null);
  const [collectionForm, setCollectionForm] = useState<CollectionFormState>(EMPTY_COLLECTION_FORM);
  const [savingCollection, setSavingCollection] = useState(false);

  const { data: cuisines = [] } = useQuery({
    queryKey: ["admin-cuisines"],
    queryFn: async () => {
      const { data, error } = await supabase.from("cuisines").select("*").order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: collectionsRaw = [] } = useQuery({
    queryKey: ["admin-collections-raw"],
    queryFn: async () => {
      const [collectionsRes, linksRes] = await Promise.all([
        supabase.from("collections").select("*").order("title"),
        supabase.from("collection_restaurants").select("collection_id, restaurant_id, sort_order").order("sort_order"),
      ]);
      if (collectionsRes.error) throw collectionsRes.error;
      if (linksRes.error) throw linksRes.error;
      return {
        collections: collectionsRes.data || [],
        links: linksRes.data || [],
      };
    },
  });

  const { data: restaurants = [] } = useQuery({
    queryKey: ["admin-catalog-restaurants"],
    queryFn: async () => {
      const { data, error } = await supabase.from("restaurants").select("id, name").order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const collections = useMemo(() => {
    const linksByCollection = new Map<string, string[]>();
    for (const link of collectionsRaw.links || []) {
      const existing = linksByCollection.get(link.collection_id) || [];
      existing.push(link.restaurant_id);
      linksByCollection.set(link.collection_id, existing);
    }

    return (collectionsRaw.collections || []).map((collection: any) => ({
      ...collection,
      restaurant_ids: linksByCollection.get(collection.id) || [],
    }));
  }, [collectionsRaw]);

  const handleAddCuisine = async () => {
    if (!newCuisine.trim()) return;
    const cuisineName = newCuisine.trim();
    const { error } = await supabase.from("cuisines").insert({ name: cuisineName });

    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Cuisine ajoutee" });
    setNewCuisine("");
    queryClient.invalidateQueries({ queryKey: ["admin-cuisines"] });
  };

  const handleDeleteCuisine = async (id: string) => {
    const { error } = await supabase.from("cuisines").delete().eq("id", id);
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Cuisine supprimee" });
    queryClient.invalidateQueries({ queryKey: ["admin-cuisines"] });
  };

  const openCreateCollection = () => {
    setEditingCollection(null);
    setCollectionForm(EMPTY_COLLECTION_FORM);
    setCollectionOpen(true);
  };

  const openEditCollection = (collection: any) => {
    setEditingCollection(collection);
    setCollectionForm({
      title: collection.title || "",
      description: collection.description || "",
      image_url: collection.image_url || "",
      is_active: collection.is_active ?? true,
      restaurant_ids: collection.restaurant_ids || [],
    });
    setCollectionOpen(true);
  };

  const toggleRestaurant = (restaurantId: string) => {
    setCollectionForm((prev) => ({
      ...prev,
      restaurant_ids: prev.restaurant_ids.includes(restaurantId)
        ? prev.restaurant_ids.filter((id) => id !== restaurantId)
        : [...prev.restaurant_ids, restaurantId],
    }));
  };

  const saveCollection = async (event: React.FormEvent) => {
    event.preventDefault();
    setSavingCollection(true);

    let collectionId = editingCollection?.id as string | undefined;
    if (editingCollection) {
      const { error } = await supabase
        .from("collections")
        .update({
          title: collectionForm.title,
          description: collectionForm.description || null,
          image_url: collectionForm.image_url || null,
          is_active: collectionForm.is_active,
        })
        .eq("id", collectionId);
      if (error) {
        setSavingCollection(false);
        toast({ title: "Erreur", description: error.message, variant: "destructive" });
        return;
      }
    } else {
      const { data, error } = await supabase
        .from("collections")
        .insert({
          title: collectionForm.title,
          description: collectionForm.description || null,
          image_url: collectionForm.image_url || null,
          is_active: collectionForm.is_active,
        })
        .select("id")
        .single();
      if (error || !data?.id) {
        setSavingCollection(false);
        toast({ title: "Erreur", description: error?.message || "Impossible de creer la collection.", variant: "destructive" });
        return;
      }
      collectionId = data.id;
    }

    const { error: deleteLinksError } = await supabase.from("collection_restaurants").delete().eq("collection_id", collectionId);
    if (deleteLinksError) {
      setSavingCollection(false);
      toast({ title: "Erreur", description: deleteLinksError.message, variant: "destructive" });
      return;
    }

    if (collectionForm.restaurant_ids.length > 0) {
      const { error: insertLinksError } = await supabase.from("collection_restaurants").insert(
        collectionForm.restaurant_ids.map((restaurantId, index) => ({
          collection_id: collectionId,
          restaurant_id: restaurantId,
          sort_order: index,
        }))
      );
      if (insertLinksError) {
        setSavingCollection(false);
        toast({ title: "Erreur", description: insertLinksError.message, variant: "destructive" });
        return;
      }
    }

    setSavingCollection(false);
    setCollectionOpen(false);
    setEditingCollection(null);
    setCollectionForm(EMPTY_COLLECTION_FORM);
    queryClient.invalidateQueries({ queryKey: ["admin-collections-raw"] });
    toast({ title: editingCollection ? "Collection mise a jour" : "Collection creee" });
  };

  const deleteCollection = async (id: string) => {
    const { error } = await supabase.from("collections").delete().eq("id", id);
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Collection supprimee" });
    queryClient.invalidateQueries({ queryKey: ["admin-collections-raw"] });
  };

  return (
    <div className="container py-8 space-y-6">
      <div className="flex justify-between items-center gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">Catalogue Global</h1>
          <p className="text-muted-foreground">Gerez les cuisines, collections et restaurants mis en avant.</p>
        </div>
        <Dialog open={collectionOpen} onOpenChange={setCollectionOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreateCollection}>
              <Plus className="w-4 h-4 mr-2" />
              Creer une collection
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>{editingCollection ? "Modifier la collection" : "Nouvelle collection"}</DialogTitle></DialogHeader>
            <form onSubmit={saveCollection} className="space-y-4">
              <Input
                placeholder="Titre de collection"
                value={collectionForm.title}
                onChange={(event) => setCollectionForm((prev) => ({ ...prev, title: event.target.value }))}
                required
              />
              <Textarea
                placeholder="Description"
                value={collectionForm.description}
                onChange={(event) => setCollectionForm((prev) => ({ ...prev, description: event.target.value }))}
              />
              <Input
                placeholder="Image URL"
                value={collectionForm.image_url}
                onChange={(event) => setCollectionForm((prev) => ({ ...prev, image_url: event.target.value }))}
              />
              <label className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={collectionForm.is_active}
                  onChange={() => setCollectionForm((prev) => ({ ...prev, is_active: !prev.is_active }))}
                />
                <span>Collection active</span>
              </label>
              <div className="space-y-2">
                <p className="text-sm font-medium">Restaurants associes</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-56 overflow-y-auto rounded-lg border p-3">
                  {restaurants.map((restaurant: any) => (
                    <label key={restaurant.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={collectionForm.restaurant_ids.includes(restaurant.id)}
                        onChange={() => toggleRestaurant(restaurant.id)}
                      />
                      <span>{restaurant.name}</span>
                    </label>
                  ))}
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={savingCollection}>
                {savingCollection ? "Enregistrement..." : editingCollection ? "Mettre a jour" : "Creer"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Tag className="w-5 h-5 text-primary" />
              <CardTitle>Cuisines</CardTitle>
            </div>
            <CardDescription>Tags globaux assignables aux restaurants</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="Nouvelle specialite..."
                value={newCuisine}
                onChange={(event) => setNewCuisine(event.target.value)}
              />
              <Button onClick={handleAddCuisine}><Plus className="w-4 h-4" /></Button>
            </div>

            <div className="space-y-2 mt-4">
              {cuisines.map((cuisine: any) => (
                <div key={cuisine.id} className="flex items-center justify-between rounded-lg border px-3 py-2">
                  <span className="text-sm">{cuisine.name}</span>
                  <Button size="icon" variant="ghost" className="text-destructive" onClick={() => handleDeleteCuisine(cuisine.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
              {cuisines.length === 0 ? <p className="text-sm text-muted-foreground">Aucune cuisine definie.</p> : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-amber-500" />
              <CardTitle>Collections a la une</CardTitle>
            </div>
            <CardDescription>Carrousels thematiques de la page d'accueil</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {collections.map((collection: any) => (
              <div key={collection.id} className="border p-3 rounded-lg space-y-3">
                <div className="flex justify-between items-start gap-3">
                  <div>
                    <p className="font-semibold">{collection.title}</p>
                    <p className="text-xs text-muted-foreground">{collection.description || "Sans description"}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {collection.restaurant_ids.length} restaurant(s) associe(s)
                    </p>
                  </div>
                  <span className={`px-2 py-1 text-xs rounded-full ${collection.is_active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-700"}`}>
                    {collection.is_active ? "Actif" : "Inactif"}
                  </span>
                </div>
                <div className="flex items-center justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => openEditCollection(collection)}>
                    <Pencil className="w-4 h-4 mr-2" />
                    Modifier
                  </Button>
                  <Button variant="ghost" size="sm" className="text-destructive" onClick={() => deleteCollection(collection.id)}>
                    <Trash2 className="w-4 h-4 mr-2" />
                    Supprimer
                  </Button>
                </div>
              </div>
            ))}
            {collections.length === 0 ? <p className="text-sm text-muted-foreground">Aucune collection definie.</p> : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
