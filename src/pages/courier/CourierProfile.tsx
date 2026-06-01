import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LogOut, Plus, Save, ShieldCheck, Trash2, UserRound } from "lucide-react";
import { toast } from "sonner";

import CourierPushStatusCard from "@/components/courier/CourierPushStatusCard";
import CourierDashboardLayout from "@/components/CourierDashboardLayout";
import SignupApplicationStatusCard from "@/components/signup/SignupApplicationStatusCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCourierProfile } from "@/hooks/useCourierProfile";
import { useSignupApplication } from "@/hooks/useSignupApplication";
import {
  COURIER_APPROVAL_STATUS_META,
  COURIER_VEHICLE_OPTIONS,
  COURIER_WEEK_DAYS,
  fetchCourierShifts,
  saveCourierProfile,
  type CourierShiftInput,
} from "@/lib/courier";
import { useAuth } from "@/lib/auth-context";

type ShiftSlotFormRow = {
  id: string;
  start_time: string;
  end_time: string;
};

type ShiftRow = {
  day_of_week: number;
  start_time?: string | null;
  end_time?: string | null;
};

const EMPTY_SHIFTS: ShiftRow[] = [];

function createEmptySlot(startTime = "11:30", endTime = "14:30"): ShiftSlotFormRow {
  return {
    id: crypto.randomUUID(),
    start_time: startTime,
    end_time: endTime,
  };
}

function createDefaultShiftGroups(): Record<number, ShiftSlotFormRow[]> {
  return COURIER_WEEK_DAYS.reduce((acc, day) => {
    acc[day.value] = [];
    return acc;
  }, {} as Record<number, ShiftSlotFormRow[]>);
}

function hydrateShiftGroups(shifts: ShiftRow[]) {
  const nextGroups = createDefaultShiftGroups();

  for (const shift of shifts || []) {
    if (!nextGroups[shift.day_of_week]) {
      nextGroups[shift.day_of_week] = [];
    }
    nextGroups[shift.day_of_week].push(
      createEmptySlot(
        shift.start_time?.slice(0, 5) || "11:30",
        shift.end_time?.slice(0, 5) || "14:30",
      ),
    );
  }

  return nextGroups;
}

function toShiftPayload(groups: Record<number, ShiftSlotFormRow[]>): CourierShiftInput[] {
  return Object.entries(groups)
    .flatMap(([dayOfWeek, slots]) =>
      slots.map((slot) => ({
        day_of_week: Number(dayOfWeek),
        start_time: slot.start_time,
        end_time: slot.end_time,
      })),
    )
    .sort((a, b) => {
      if (a.day_of_week !== b.day_of_week) return a.day_of_week - b.day_of_week;
      return a.start_time.localeCompare(b.start_time);
    });
}

export default function CourierProfile() {
  const queryClient = useQueryClient();
  const { signOut, user } = useAuth();
  const { data: profile, isLoading: profileLoading } = useCourierProfile();
  const { data: signupApplication } = useSignupApplication("courier");
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    phone: "",
    vehicle_type: "bicycle",
    license_plate: "",
    iban: "",
  });
  const [shiftGroups, setShiftGroups] = useState<Record<number, ShiftSlotFormRow[]>>(createDefaultShiftGroups());

  const { data: shiftsData, isLoading: shiftsLoading } = useQuery({
    queryKey: ["courier-shifts", profile?.id],
    enabled: !!profile?.id,
    queryFn: () => fetchCourierShifts(profile!.id),
  });
  const shifts = shiftsData ?? EMPTY_SHIFTS;

  useEffect(() => {
    if (!profile) return;
    setForm({
      first_name: profile.first_name || "",
      last_name: profile.last_name || "",
      phone: profile.phone || "",
      vehicle_type: profile.vehicle_type || "bicycle",
      license_plate: profile.license_plate || "",
      iban: profile.iban || "",
    });
  }, [profile]);

  useEffect(() => {
    setShiftGroups(hydrateShiftGroups(shifts));
  }, [shifts]);

  const approvalMeta = COURIER_APPROVAL_STATUS_META[profile?.status || "pending_approval"];

  const saveMutation = useMutation({
    mutationFn: async () =>
      saveCourierProfile({
        ...form,
        shifts: toShiftPayload(shiftGroups),
      }),
    onSuccess: () => {
      toast.success("Profil coursier mis à jour");
      queryClient.invalidateQueries({ queryKey: ["courier-profile", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["courier-shifts"] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Impossible de sauvegarder le profil.");
    },
  });

  const stats = useMemo(() => ({
    rating: Number(profile?.rating || 0).toFixed(1),
    totalDeliveries: profile?.total_deliveries || 0,
    averageTime: profile?.avg_delivery_time_min || 0,
  }), [profile]);

  const updateShiftSlot = (dayOfWeek: number, slotId: string, key: "start_time" | "end_time", value: string) => {
    setShiftGroups((current) => ({
      ...current,
      [dayOfWeek]: current[dayOfWeek].map((slot) =>
        slot.id === slotId ? { ...slot, [key]: value } : slot,
      ),
    }));
  };

  const addShiftSlot = (dayOfWeek: number) => {
    setShiftGroups((current) => ({
      ...current,
      [dayOfWeek]: [...current[dayOfWeek], createEmptySlot()],
    }));
  };

  const removeShiftSlot = (dayOfWeek: number, slotId: string) => {
    setShiftGroups((current) => ({
      ...current,
      [dayOfWeek]: current[dayOfWeek].filter((slot) => slot.id !== slotId),
    }));
  };

  if (profileLoading || shiftsLoading) {
    return (
      <CourierDashboardLayout>
        <div className="space-y-4">
          {[1, 2, 3].map((value) => (
            <div key={value} className="h-28 animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
      </CourierDashboardLayout>
    );
  }

  return (
    <CourierDashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-primary/10 p-3">
              <UserRound className="h-6 w-6 text-primary" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h1 className="font-display text-3xl font-bold">Mon profil coursier</h1>
                <Badge className={approvalMeta?.tone}>{approvalMeta?.label || profile?.status}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">{user?.email}</p>
            </div>
          </div>

          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            <Save className="mr-2 h-4 w-4" />
            Sauvegarder
          </Button>
        </div>

        <SignupApplicationStatusCard
          application={signupApplication}
          title="Dossier de vérification livreur"
          emptyDescription="Aucun dossier livreur n'a encore été soumis."
        />

        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <Card>
            <CardHeader>
              <CardTitle>Informations générales</CardTitle>
              <CardDescription>Coordonnées, vehicule et informations de paiement.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="first_name">Prenom</Label>
                <Input
                  id="first_name"
                  value={form.first_name}
                  onChange={(event) => setForm((prev) => ({ ...prev, first_name: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="last_name">Nom</Label>
                <Input
                  id="last_name"
                  value={form.last_name}
                  onChange={(event) => setForm((prev) => ({ ...prev, last_name: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Téléphone</Label>
                <Input
                  id="phone"
                  value={form.phone}
                  onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
                  placeholder="+41 79 000 00 00"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="vehicle_type">Vehicule</Label>
                <Select
                  value={form.vehicle_type}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, vehicle_type: value }))}
                >
                  <SelectTrigger id="vehicle_type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COURIER_VEHICLE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="license_plate">Plaque d'immatriculation</Label>
                <Input
                  id="license_plate"
                  value={form.license_plate}
                  onChange={(event) => setForm((prev) => ({ ...prev, license_plate: event.target.value }))}
                  placeholder="Optionnel"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="iban">IBAN</Label>
                <Input
                  id="iban"
                  value={form.iban}
                  onChange={(event) => setForm((prev) => ({ ...prev, iban: event.target.value }))}
                  placeholder="CH93 0076 2011 6238 5295 7"
                />
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <CourierPushStatusCard />

            <Card>
              <CardHeader>
                <CardTitle>Qualité de service</CardTitle>
                <CardDescription>Indicateurs reliés à vos missions.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between rounded-xl border p-3">
                  <span className="text-sm">Note moyenne</span>
                  <span className="font-semibold">{stats.rating}/5</span>
                </div>
                <div className="flex items-center justify-between rounded-xl border p-3">
                  <span className="text-sm">Livraisons realisees</span>
                  <span className="font-semibold">{stats.totalDeliveries}</span>
                </div>
                <div className="flex items-center justify-between rounded-xl border p-3">
                  <span className="text-sm">Temps moyen</span>
                  <span className="font-semibold">{stats.averageTime} min</span>
                </div>
                <div className="flex items-center justify-between rounded-xl border p-3">
                  <span className="text-sm">Taux d'acceptation</span>
                  <span className="font-semibold">{Number(profile?.acceptance_rate || 0).toFixed(0)}%</span>
                </div>
                <div className="flex items-center justify-between rounded-xl border p-3">
                  <span className="text-sm">Compte approuve</span>
                  <span className="flex items-center gap-2 font-semibold">
                    <ShieldCheck className="h-4 w-4 text-primary" />
                    {approvalMeta?.label}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Disponibilites hebdomadaires</CardTitle>
            <CardDescription>
              Ajoutez plusieurs plages horaires par jour. Ces créneaux servent à votre planning et à la diffusion des missions.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {COURIER_WEEK_DAYS.map((day) => {
              const slots = shiftGroups[day.value] || [];
              return (
                <div key={day.value} className="rounded-2xl border p-4">
                  <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-semibold">{day.label}</p>
                      <p className="text-sm text-muted-foreground">
                        {slots.length > 0 ? `${slots.length} créneau(x)` : "Aucun créneau"}
                      </p>
                    </div>
                    <Button type="button" variant="outline" onClick={() => addShiftSlot(day.value)}>
                      <Plus className="mr-2 h-4 w-4" />
                      Ajouter un créneau
                    </Button>
                  </div>

                  {slots.length > 0 ? (
                    <div className="space-y-3">
                      {slots.map((slot, index) => (
                        <div key={slot.id} className="grid gap-3 rounded-2xl border bg-muted/20 p-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
                          <div className="space-y-2">
                            <Label>Debut</Label>
                            <Input
                              type="time"
                              value={slot.start_time}
                              onChange={(event) => updateShiftSlot(day.value, slot.id, "start_time", event.target.value)}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Fin</Label>
                            <Input
                              type="time"
                              value={slot.end_time}
                              onChange={(event) => updateShiftSlot(day.value, slot.id, "end_time", event.target.value)}
                            />
                          </div>
                          <div className="flex items-center justify-between gap-3 md:justify-end">
                            <span className="text-sm text-muted-foreground">Créneau {index + 1}</span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => removeShiftSlot(day.value, slot.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">
                      Aucun créneau configuré pour cette journée.
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Button variant="destructive" className="w-full md:w-auto" onClick={signOut}>
          <LogOut className="mr-2 h-4 w-4" />
          Deconnexion
        </Button>
      </div>
    </CourierDashboardLayout>
  );
}
