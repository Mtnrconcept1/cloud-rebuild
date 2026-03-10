import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MapPin, Navigation, Clock, Package } from "lucide-react";
import { toast } from "sonner";

export default function CourierJobs() {
    const { user } = useAuth();
    const [jobs, setJobs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (user) {
            fetchJobs();
        }
    }, [user]);

    const fetchJobs = async () => {
        setLoading(true);
        // Fetch active or assigned jobs for this courier
        const { data: courierRow } = await supabase
            .from('couriers')
            .select('id')
            .eq('user_id', user?.id)
            .maybeSingle();

        if (!courierRow) return setLoading(false);

        const { data, error } = await supabase
            .from("dispatch_jobs")
            .select(`
        *,
        orders (
          id, pickup_address, delivery_address, restaurant_id, status,
          restaurants ( name, address )
        )
      `)
            .eq("courier_id", courierRow.id)
            .in("status", ["assigned", "accepted", "arriving_pickup", "picked_up", "arriving_dropoff"])
            .order("created_at", { ascending: false });

        if (error) {
            console.error(error);
            toast.error("Erreur lors de la récupération des missions.");
        } else {
            setJobs(data || []);
        }
        setLoading(false);
    };

    const updateJobStatus = async (jobId: string, orderId: string, newStatus: string, actionMsg: string) => {
        const { error: jobError } = await supabase
            .from("dispatch_jobs")
            .update({ status: newStatus, updated_at: new Date().toISOString() })
            .eq("id", jobId);

        if (jobError) return toast.error("Erreur lors de la mise à jour.");

        // Update order status contextually
        let orderStatus = '';
        if (newStatus === 'picked_up') orderStatus = 'picked_up';
        if (newStatus === 'completed') orderStatus = 'delivered';

        if (orderStatus) {
            await supabase.from("orders").update({ status: orderStatus }).eq("id", orderId);
        }

        toast.success(actionMsg);
        fetchJobs();
    };

    if (loading) return <div className="p-8 text-center">Chargement des missions...</div>;

    return (
        <div className="container mx-auto p-4 space-y-6 max-w-lg mt-16">
            <h1 className="text-2xl font-bold">Missions Actives</h1>
            {jobs.length === 0 ? (
                <p className="text-muted-foreground">Aucune mission en cours.</p>
            ) : (
                <div className="space-y-4">
                    {jobs.map((job) => (
                        <Card key={job.id}>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-lg flex items-center justify-between">
                                    <span>Commande #{job.orders?.id?.split('-')[0]}</span>
                                    <span className="text-sm px-2 py-1 bg-blue-100 text-blue-800 rounded-full">{job.status}</span>
                                </CardTitle>
                                <CardDescription className="flex items-center gap-1 mt-1">
                                    <Clock className="w-4 h-4" /> Estimé: {job.estimated_distance_meters ? (job.estimated_distance_meters / 1000).toFixed(1) : '?'} km
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <div className="flex items-start gap-2">
                                    <Package className="w-5 h-5 text-gray-500 shrink-0 mt-0.5" />
                                    <div>
                                        <p className="font-semibold text-sm">Retrait: {job.orders?.restaurants?.name}</p>
                                        <p className="text-xs text-muted-foreground">{job.orders?.restaurants?.address}</p>
                                    </div>
                                </div>
                                <div className="flex items-start gap-2">
                                    <MapPin className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                                    <div>
                                        <p className="font-semibold text-sm">Livraison</p>
                                        <p className="text-xs text-muted-foreground">{job.orders?.delivery_address}</p>
                                    </div>
                                </div>
                            </CardContent>
                            <CardFooter className="flex flex-col gap-2">
                                {job.status === 'assigned' && (
                                    <Button className="w-full" onClick={() => updateJobStatus(job.id, job.order_id, 'accepted', 'Mission acceptée')}>
                                        Accepter la course
                                    </Button>
                                )}
                                {job.status === 'accepted' && (
                                    <Button className="w-full" variant="outline" onClick={() => updateJobStatus(job.id, job.order_id, 'picked_up', 'Commande récupérée')}>
                                        J'ai récupéré la commande
                                    </Button>
                                )}
                                {job.status === 'picked_up' && (
                                    <Button className="w-full bg-green-600 hover:bg-green-700" onClick={() => updateJobStatus(job.id, job.order_id, 'completed', 'Commande livrée avec succès')}>
                                        Confirmer la livraison
                                    </Button>
                                )}
                            </CardFooter>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}
