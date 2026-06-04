import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSupabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import DashboardPageHero from "@/components/dashboard/DashboardPageHero";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { ArrowDown, ArrowUp, ImagePlus, Layers, Pencil, Plus, Tag, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  IMAGE_MIME_EXTENSIONS,
  MAX_IMAGE_UPLOAD_BYTES,
  assertSafeFileUpload,
  getSafeUploadExtension,
} from "@/lib/uploadSecurity";

const supabase = getSupabase();

type CollectionFormState = {
  title: string;
  description: string;
  image_url: string;
  is_active: boolean;
  sort_order: number;
  restaurant_ids: string[];
};

const EMPTY_COLLECTION_FORM: CollectionFormState = {
  title: "",
  description: "",
  image_url: "",
  is_active: false,
  sort_order: 0,
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
      const { data, error } = await supabase
        .from("cuisines")
        .select("*")
        .is("archived_at", null)
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: collectionsRaw = [] } = useQuery({
    queryKey: ["admin-collections-raw"],
    queryFn: async () => {
      const [collectionsRes, linksRes] = await Promise.all([
        supabase.from("collections").select("*").order("sort_order").order("title"),
        supabase.from("collection_restaurants").select("collection_id, restaurant_id, sort_order").order("sort_order"),
      ]);
      if (collectionsRes.error) throw collectionsRes.error;
      if (linksRes.error) throw linksRes.error;
      return { collections: collectionsRes.data || [], links: linksRes.data || [] };
    },
  });

  const { data: restaurants = [] } = useQuery({
    queryKey: ["admin-catalog-restaurants"],
    queryFn: async () => {
      const { data, error } = await supabase.from("restaurants").select("id, name, is_active, image_url").order("name");
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

  const uploadCatalogMedia = async (file: File) => {
    try {
      assertSafeFileUpload(file, {
        allowedMimeTypes: IMAGE_MIME_EXTENSIONS,
        maxBytes: MAX_IMAGE_UPLOAD_BYTES,
        label: "Image catalogue",
      });
    } catch (error) {
      toast({ title: "Upload refusé", description: error instanceof Error ? error.message : "Fichier non autorisé.", variant: "destructive" });
      return;
    }

    const extension = getSafeUploadExtension(file, IMAGE_MIME_EXTENSIONS);
    const path = `catalog/${crypto.randomUUID()}.${extension}`;
    const { error } = await supabase.storage.from("catalog-media").upload(path, file, { upsert: false });
    if (error) {
      toast({ title: "Erreur upload", description: error.message, variant: "destructive" });
      return;
    }
    const { data } = supabase.storage.from("catalog-media").getPublicUrl(path);
    setCollectionForm((prev) => ({ ...prev, image_url: data.publicUrl }));
  };

  const handleAddCuisine = async () => {
    if (!newCuisine.trim()) return;
    const { error } = await (supabase.rpc as any)("admin_upsert_cuisine", {
      p_cuisine_id: null,
      p_name: newCuisine.trim(),
      p_reason: "Creation cuisine catalogue",
    });
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Cuisine ajoutée" });
    setNewCuisine("");
    queryClient.invalidateQueries({ queryKey: ["admin-cuisines"] });
  };

  const handleDeleteCuisine = async (id: string) => {
    const reason = window.prompt("Raison obligatoire pour archiver cette cuisine.");
    if (!reason?.trim()) return;
    const { error } = await (supabase.rpc as any)("admin_archive_cuisine", {
      p_cuisine_id: id,
      p_reason: reason.trim(),
    });
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Cuisine archivée" });
    queryClient.invalidateQueries({ queryKey: ["admin-cuisines"] });
  };

  const openCreateCollection = () => {
    setEditingCollection(null);
    setCollectionForm({ ...EMPTY_COLLECTION_FORM, sort_order: collections.length });
    setCollectionOpen(true);
  };

  const openEditCollection = (collection: any) => {
    setEditingCollection(collection);
    setCollectionForm({
      title: collection.title || "",
      description: collection.description || "",
      image_url: collection.image_url || "",
      is_active: collection.is_active ?? false,
      sort_order: Number(collection.sort_order || 0),
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

  const reorderCollection = async (collectionId: string, direction: -1 | 1) => {
    const ids = collections.map((collection: any) => collection.id);
    const index = ids.indexOf(collectionId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    const { error } = await (supabase.rpc as any)("admin_reorder_catalog_collections", { p_collection_ids: ids });
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["admin-collections-raw"] });
  };

  const saveCollection = async (event: React.FormEvent) => {
    event.preventDefault();
    if (collectionForm.is_active && collectionForm.restaurant_ids.length === 0) {
      toast({ title: "Publication bloquée", description: "Une collection publiée doit contenir au moins un restaurant.", variant: "destructive" });
      return;
    }
    setSavingCollection(true);

    const { error } = await (supabase.rpc as any)("admin_save_catalog_collection", {
      p_collection_id: editingCollection?.id || null,
      p_payload: {
        title: collectionForm.title,
        description: collectionForm.description || null,
        image_url: collectionForm.image_url || null,
        is_active: collectionForm.is_active,
        sort_order: collectionForm.sort_order,
      },
      p_restaurant_ids: collectionForm.restaurant_ids,
      p_reason: editingCollection ? "Mise à jour collection catalogue" : "Création collection catalogue",
    });

    setSavingCollection(false);
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
      return;
    }

    setCollectionOpen(false);
    setEditingCollection(null);
    setCollectionForm(EMPTY_COLLECTION_FORM);
    queryClient.invalidateQueries({ queryKey: ["admin-collections-raw"] });
    toast({ title: editingCollection ? "Collection mise à jour" : "Collection créée" });
  };

  const deleteCollection = async (id: string) => {
    const reason = window.prompt("Raison obligatoire pour archiver la collection.");
    if (!reason?.trim()) return;
    const { error } = await (supabase.rpc as any)("admin_archive_catalog_collection", {
      p_collection_id: id,
      p_reason: reason.trim(),
    });
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Collection archivée" });
    queryClient.invalidateQueries({ queryKey: ["admin-collections-raw"] });
  };

  const selectedRestaurants = restaurants.filter((restaurant: any) => collectionForm.restaurant_ids.includes(restaurant.id));

  return (
    <div className="container py-8 space-y-6">
      <DashboardPageHero
        badge="Catalogue"
        title="Catalogue Global"
        description="Gérez cuisines, collections, médias, ordre et validation publication."
        icon={Layers}
        tone="violet"
        visualLabel="Catalogue"
        stats={[
          { label: "Cuisines", value: cuisines.length, icon: Tag },
          { label: "Collections", value: collections.length, icon: Layers },
          { label: "Restaurants", value: restaurants.length, icon: Layers },
        ]}
        actions={(
          <Dialog open={collectionOpen} onOpenChange={setCollectionOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreateCollection}>
                <Plus className="w-4 h-4 mr-2" />
                Créer une collection
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl">
              <DialogHeader><DialogTitle>{editingCollection ? "Modifier la collection" : "Nouvelle collection"}</DialogTitle></DialogHeader>
              <form onSubmit={saveCollection} className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                <div className="space-y-4">
                  <Input placeholder="Titre de collection" value={collectionForm.title} onChange={(event) => setCollectionForm((prev) => ({ ...prev, title: event.target.value }))} required />
                  <Textarea placeholder="Description" value={collectionForm.description} onChange={(event) => setCollectionForm((prev) => ({ ...prev, description: event.target.value }))} />
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                    <ImagePlus className="h-4 w-4" />
                    <span>Uploader un média catalogue</span>
                    <input className="sr-only" type="file" accept="image/*" onChange={(event) => event.target.files?.[0] && uploadCatalogMedia(event.target.files[0])} />
                  </label>
                  <Input placeholder="URL média contrôlée" value={collectionForm.image_url} onChange={(event) => setCollectionForm((prev) => ({ ...prev, image_url: event.target.value }))} />
                  <label className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                    <input type="checkbox" checked={collectionForm.is_active} onChange={() => setCollectionForm((prev) => ({ ...prev, is_active: !prev.is_active }))} />
                    <span>Collection active</span>
                  </label>
                  {collectionForm.is_active && collectionForm.restaurant_ids.length === 0 ? (
                    <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive">Collection vide non publiable.</p>
                  ) : null}
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Restaurants associés</p>
                    <div className="grid max-h-56 grid-cols-1 gap-2 overflow-y-auto rounded-lg border p-3 md:grid-cols-2">
                      {restaurants.map((restaurant: any) => (
                        <label key={restaurant.id} className="flex items-center gap-2 text-sm">
                          <input type="checkbox" checked={collectionForm.restaurant_ids.includes(restaurant.id)} onChange={() => toggleRestaurant(restaurant.id)} />
                          <span>{restaurant.name}</span>
                          {!restaurant.is_active ? <span className="text-xs text-amber-600">inactif</span> : null}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="space-y-3">
                  <Card>
                    <CardHeader><CardTitle>Aperçu public</CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                      {collectionForm.image_url ? <img src={collectionForm.image_url} alt="" className="h-32 w-full rounded-md object-cover" /> : <div className="flex h-32 items-center justify-center rounded-md bg-muted text-sm text-muted-foreground">Média requis recommandé</div>}
                      <div>
                        <p className="font-semibold">{collectionForm.title || "Titre collection"}</p>
                        <p className="text-sm text-muted-foreground">{collectionForm.description || "Description collection"}</p>
                      </div>
                      <div className="space-y-1">
                        {selectedRestaurants.slice(0, 4).map((restaurant: any) => (
                          <div key={restaurant.id} className="rounded-md border px-2 py-1 text-sm">{restaurant.name}</div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                  <Button type="submit" className="w-full" disabled={savingCollection || (collectionForm.is_active && collectionForm.restaurant_ids.length === 0)}>
                    {savingCollection ? "Enregistrement..." : editingCollection ? "Mettre à jour" : "Créer"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        )}
      />

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Tag className="w-5 h-5 text-primary" />
              <CardTitle>Cuisines</CardTitle>
            </div>
            <CardDescription>Tags globaux assignables aux restaurants.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input placeholder="Nouvelle spécialité..." value={newCuisine} onChange={(event) => setNewCuisine(event.target.value)} />
              <Button onClick={handleAddCuisine}><Plus className="w-4 h-4" /></Button>
            </div>
            <div className="mt-4 space-y-2">
              {cuisines.map((cuisine: any) => (
                <div key={cuisine.id} className="flex items-center justify-between rounded-lg border px-3 py-2">
                  <span className="text-sm">{cuisine.name}</span>
                  <Button size="icon" variant="ghost" className="text-destructive" onClick={() => handleDeleteCuisine(cuisine.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
              {cuisines.length === 0 ? <p className="text-sm text-muted-foreground">Aucune cuisine définie.</p> : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-amber-500" />
              <CardTitle>Collections à la une</CardTitle>
            </div>
            <CardDescription>Ordre, publication, preview et validation des carrousels.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {collections.map((collection: any, index: number) => (
              <div key={collection.id} className="space-y-3 rounded-lg border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{collection.title}</p>
                    <p className="text-xs text-muted-foreground">{collection.description || "Sans description"}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{collection.restaurant_ids.length} restaurant(s) associé(s)</p>
                    {collection.is_active && collection.restaurant_ids.length === 0 ? <p className="text-xs text-destructive">Collection vide non publiable</p> : null}
                  </div>
                  <span className={`rounded-full px-2 py-1 text-xs ${collection.is_active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-700"}`}>
                    {collection.is_active ? "Actif" : "Inactif"}
                  </span>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Button variant="outline" size="sm" disabled={index === 0} onClick={() => reorderCollection(collection.id, -1)}><ArrowUp className="w-4 h-4 mr-2" />Monter</Button>
                  <Button variant="outline" size="sm" disabled={index === collections.length - 1} onClick={() => reorderCollection(collection.id, 1)}><ArrowDown className="w-4 h-4 mr-2" />Descendre</Button>
                  <Button variant="outline" size="sm" onClick={() => openEditCollection(collection)}><Pencil className="w-4 h-4 mr-2" />Modifier</Button>
                  <Button variant="ghost" size="sm" className="text-destructive" onClick={() => deleteCollection(collection.id)}><Trash2 className="w-4 h-4 mr-2" />Archiver</Button>
                </div>
              </div>
            ))}
            {collections.length === 0 ? <p className="text-sm text-muted-foreground">Aucune collection définie.</p> : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
