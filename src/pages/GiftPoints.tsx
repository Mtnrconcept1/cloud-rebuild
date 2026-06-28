import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getSupabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Gift, Send, Download, Trophy, Heart, Users,
  ChevronRight, CheckCircle2, Clock, Mail,
  Sparkles, ArrowUpRight, Copy, AlertCircle,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import LoyaltyStatus from "@/components/LoyaltyStatus";

const supabase = getSupabase();

const PRESET_AMOUNTS = [100, 250, 500, 1000, 2500];

const GIFT_MESSAGES = [
  "Bon appétit ! 🍽️",
  "Un petit cadeau pour te faire plaisir !",
  "Offre-toi un bon repas de ma part !",
  "Joyeux anniversaire ! 🎂",
  "Merci pour tout ! ❤️",
];

type Step = "choose" | "recipient" | "confirm" | "done";

export default function GiftPoints() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Send flow states
  const [step, setStep] = useState<Step>("choose");
  const [amount, setAmount] = useState<number>(0);
  const [customAmount, setCustomAmount] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [message, setMessage] = useState(GIFT_MESSAGES[0]);
  const [giftResult, setGiftResult] = useState<{ id: string; claimCode?: string } | null>(null);

  // Claim flow
  const [claimCode, setClaimCode] = useState("");

  // Fetch user profile for points balance
  const { data: profile } = useQuery({
    queryKey: ["profile-loyalty", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles" as any)
        .select("loyalty_points, current_tier, full_name")
        .eq("user_id", user?.id)
        .single();
      return data as any;
    },
    enabled: !!user,
  });

  // Fetch gift stats
  const { data: giftStats } = useQuery({
    queryKey: ["gift-stats", user?.id],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("get_gift_stats");
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Fetch sent gifts
  const { data: sentGifts } = useQuery({
    queryKey: ["gifts-sent", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("gift_points" as any)
        .select("*")
        .eq("sender_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(20);
      return data || [];
    },
    enabled: !!user,
  });

  // Fetch received gifts
  const { data: receivedGifts } = useQuery({
    queryKey: ["gifts-received", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("gift_points" as any)
        .select("*")
        .eq("recipient_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(20);
      return data || [];
    },
    enabled: !!user,
  });

  // Send gift mutation
  const sendGiftMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase.rpc as any)("send_gift_points", {
        recipient_email_param: recipientEmail,
        points_param: amount,
        message_param: message || null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (giftId: string) => {
      queryClient.invalidateQueries({ queryKey: ["profile-loyalty"] });
      queryClient.invalidateQueries({ queryKey: ["gift-stats"] });
      queryClient.invalidateQueries({ queryKey: ["gifts-sent"] });
      queryClient.invalidateQueries({ queryKey: ["loyalty-transactions"] });
      setGiftResult({ id: giftId });
      setStep("done");
      toast({
        title: "Cadeau envoyé !",
        description: `${amount} Miamz envoyés à ${recipientEmail}`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erreur",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Claim gift mutation
  const claimGiftMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase.rpc as any)("claim_gift_points", {
        claim_code_param: claimCode.trim(),
      });
      if (error) throw error;
      return data as number;
    },
    onSuccess: (pointsClaimed: number) => {
      queryClient.invalidateQueries({ queryKey: ["profile-loyalty"] });
      queryClient.invalidateQueries({ queryKey: ["gift-stats"] });
      queryClient.invalidateQueries({ queryKey: ["gifts-received"] });
      queryClient.invalidateQueries({ queryKey: ["loyalty-transactions"] });
      setClaimCode("");
      toast({
        title: "Cadeau réclamé !",
        description: `Vous avez reçu ${pointsClaimed} Miamz !`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erreur",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const loyaltyPoints = profile?.loyalty_points || 0;
  const effectiveAmount = customAmount ? parseInt(customAmount) || 0 : amount;
  const canSend = effectiveAmount >= 100 && effectiveAmount <= loyaltyPoints && recipientEmail.includes("@");

  const resetSendFlow = () => {
    setStep("choose");
    setAmount(0);
    setCustomAmount("");
    setRecipientEmail("");
    setMessage(GIFT_MESSAGES[0]);
    setGiftResult(null);
  };

  if (!user) {
    return (
      <main className="min-h-screen bg-background">
        <div className="container py-16 text-center space-y-4">
          <Gift className="h-12 w-12 mx-auto text-muted-foreground" />
          <h1 className="font-display text-2xl font-bold">Points Cadeau</h1>
          <p className="text-muted-foreground">Connectez-vous pour envoyer des points à vos amis</p>
          <Button onClick={() => navigate("/auth")}>Se connecter</Button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="container py-8 max-w-3xl space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-pink-500/10 flex items-center justify-center">
            <Gift className="h-6 w-6 text-pink-500" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold">Points Cadeau</h1>
            <p className="text-muted-foreground text-xs">Offrez des Miamz à vos proches</p>
          </div>
        </div>

        {/* Loyalty Status */}
        <LoyaltyStatus />

        {/* Gift Stats */}
        {giftStats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl bg-pink-500/5 border border-pink-500/10 p-3 text-center">
              <Send className="h-4 w-4 text-pink-500 mx-auto mb-1" />
              <p className="text-lg font-bold">{giftStats.gifts_sent_count || 0}</p>
              <p className="text-[10px] text-muted-foreground">Cadeaux envoyés</p>
            </div>
            <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/10 p-3 text-center">
              <Download className="h-4 w-4 text-emerald-500 mx-auto mb-1" />
              <p className="text-lg font-bold">{giftStats.gifts_received_count || 0}</p>
              <p className="text-[10px] text-muted-foreground">Cadeaux reçus</p>
            </div>
            <div className="rounded-xl bg-amber-500/5 border border-amber-500/10 p-3 text-center">
              <Trophy className="h-4 w-4 text-amber-500 mx-auto mb-1" />
              <p className="text-lg font-bold">{(giftStats.points_sent || giftStats.total_points_sent || 0).toLocaleString()}</p>
              <p className="text-[10px] text-muted-foreground">Points offerts</p>
            </div>
            <div className="rounded-xl bg-blue-500/5 border border-blue-500/10 p-3 text-center">
              <Clock className="h-4 w-4 text-blue-500 mx-auto mb-1" />
              <p className="text-lg font-bold">{giftStats.pending_gifts || 0}</p>
              <p className="text-[10px] text-muted-foreground">En attente</p>
            </div>
          </div>
        )}

        <Tabs defaultValue="send" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="send" className="gap-1.5"><Send className="h-3.5 w-3.5" /> Envoyer</TabsTrigger>
            <TabsTrigger value="claim" className="gap-1.5"><Download className="h-3.5 w-3.5" /> Réclamer</TabsTrigger>
            <TabsTrigger value="history" className="gap-1.5"><Clock className="h-3.5 w-3.5" /> Historique</TabsTrigger>
          </TabsList>

          {/* =============== SEND TAB =============== */}
          <TabsContent value="send" className="space-y-6">
            {step === "choose" && (
              <div className="space-y-6">
                <div className="rounded-xl bg-gradient-to-r from-pink-500/5 to-purple-500/5 border border-pink-500/10 p-5 space-y-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-pink-500" />
                    <h3 className="font-semibold">Offrez du bonheur gourmand</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Envoyez des Miamz à un ami par email. S'il a déjà un compte, les points sont crédités instantanément.
                    Sinon, il recevra un code à utiliser lors de son inscription.
                  </p>
                </div>

                <div className="space-y-3">
                  <Label className="font-semibold">Combien de points offrir ?</Label>
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                    {PRESET_AMOUNTS.map((preset) => (
                      <button
                        key={preset}
                        onClick={() => { setAmount(preset); setCustomAmount(""); }}
                        disabled={preset > loyaltyPoints}
                        className={`rounded-xl border-2 p-3 text-center transition-all ${amount === preset && !customAmount
                            ? "border-pink-500 bg-pink-500/5"
                            : preset > loyaltyPoints
                              ? "border-border opacity-40 cursor-not-allowed"
                              : "border-border hover:border-pink-500/30"
                          }`}
                      >
                        <p className="font-bold text-sm">{preset.toLocaleString()}</p>
                        <p className="text-[10px] text-muted-foreground">{(preset / 100).toFixed(0)} CHF</p>
                      </button>
                    ))}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Ou montant personnalisé (min. 100)</Label>
                    <Input
                      type="number"
                      min={100}
                      max={loyaltyPoints}
                      value={customAmount}
                      onChange={(e) => { setCustomAmount(e.target.value); setAmount(0); }}
                      placeholder={`100 – ${loyaltyPoints.toLocaleString()}`}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Trophy className="h-3 w-3" />
                    Votre solde : <strong>{loyaltyPoints.toLocaleString()} pts</strong> ({(loyaltyPoints / 100).toFixed(2)} CHF)
                  </p>
                </div>

                <Button
                  onClick={() => { if (customAmount) setAmount(parseInt(customAmount)); setStep("recipient"); }}
                  disabled={effectiveAmount < 100 || effectiveAmount > loyaltyPoints}
                  className="w-full bg-pink-500 hover:bg-pink-600 gap-2"
                >
                  Continuer <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}

            {step === "recipient" && (
              <div className="space-y-6">
                <button onClick={() => setStep("choose")} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
                  ← Modifier le montant
                </button>

                <div className="rounded-lg bg-pink-500/5 p-3 flex items-center gap-2 text-sm">
                  <Gift className="h-4 w-4 text-pink-500" />
                  <span className="font-medium">{effectiveAmount.toLocaleString()} Miamz</span>
                  <span className="text-muted-foreground">({(effectiveAmount / 100).toFixed(2)} CHF)</span>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="font-semibold flex items-center gap-1.5">
                      <Mail className="h-4 w-4" /> Email du destinataire
                    </Label>
                    <Input
                      type="email"
                      value={recipientEmail}
                      onChange={(e) => setRecipientEmail(e.target.value)}
                      placeholder="ami@exemple.com"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="font-semibold">Message personnalisé</Label>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {GIFT_MESSAGES.map((msg) => (
                        <button
                          key={msg}
                          onClick={() => setMessage(msg)}
                          className={`text-xs rounded-full px-3 py-1 border transition-all ${message === msg ? "border-pink-500 bg-pink-500/10 text-pink-600 dark:text-pink-400" : "border-border hover:border-pink-500/30"
                            }`}
                        >
                          {msg}
                        </button>
                      ))}
                    </div>
                    <Textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Écrivez un message personnel..."
                      rows={2}
                    />
                  </div>
                </div>

                <Button
                  onClick={() => setStep("confirm")}
                  disabled={!recipientEmail.includes("@")}
                  className="w-full bg-pink-500 hover:bg-pink-600 gap-2"
                >
                  Vérifier et envoyer <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}

            {step === "confirm" && (
              <div className="space-y-6">
                <button onClick={() => setStep("recipient")} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
                  ← Modifier
                </button>

                <div className="rounded-2xl border-2 border-pink-500/20 bg-gradient-to-br from-pink-500/5 to-purple-500/5 p-6 space-y-4">
                  <div className="text-center space-y-2">
                    <Gift className="h-10 w-10 text-pink-500 mx-auto" />
                    <h2 className="font-display text-xl font-bold">Confirmation du cadeau</h2>
                  </div>

                  <div className="rounded-xl bg-background/80 p-4 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Montant</span>
                      <span className="font-bold">{effectiveAmount.toLocaleString()} pts ({(effectiveAmount / 100).toFixed(2)} CHF)</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Destinataire</span>
                      <span className="font-medium">{recipientEmail}</span>
                    </div>
                    {message && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Message</span>
                        <span className="font-medium text-right max-w-[60%] truncate">{message}</span>
                      </div>
                    )}
                    <div className="flex justify-between border-t pt-2">
                      <span className="text-muted-foreground">Solde après envoi</span>
                      <span className="font-bold">{(loyaltyPoints - effectiveAmount).toLocaleString()} pts</span>
                    </div>
                  </div>
                </div>

                <Button
                  onClick={() => sendGiftMutation.mutate()}
                  disabled={sendGiftMutation.isPending}
                  className="w-full bg-pink-500 hover:bg-pink-600 gap-2"
                  size="lg"
                >
                  {sendGiftMutation.isPending ? (
                    <div className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Envoi en cours...
                    </div>
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      Confirmer et envoyer
                    </>
                  )}
                </Button>
              </div>
            )}

            {step === "done" && (
              <div className="space-y-6">
                <div className="rounded-2xl bg-emerald-500/5 border border-emerald-500/20 p-6 text-center space-y-3">
                  <CheckCircle2 className="h-14 w-14 text-emerald-500 mx-auto" />
                  <h2 className="font-display text-xl font-bold">Cadeau envoyé !</h2>
                  <p className="text-sm text-muted-foreground">
                    {effectiveAmount.toLocaleString()} Miamz ont été envoyés à <strong>{recipientEmail}</strong>
                  </p>
                </div>

                {giftResult && (
                  <div className="rounded-xl bg-secondary/50 p-4 text-center space-y-2">
                    <p className="text-xs text-muted-foreground">
                      Si le destinataire n'a pas encore de compte, il pourra réclamer les points avec ce code :
                    </p>
                    <div className="flex items-center justify-center gap-2">
                      <code className="bg-background border rounded-lg px-4 py-2 font-mono font-bold text-lg tracking-widest">
                        {giftResult.id?.slice(0, 12) || "—"}
                      </code>
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-9 w-9"
                        onClick={() => {
                          navigator.clipboard.writeText(giftResult.id?.slice(0, 12) || "");
                          toast({ title: "Code copié !" });
                        }}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}

                <div className="flex gap-3">
                  <Button onClick={resetSendFlow} variant="outline" className="flex-1 gap-2">
                    <Gift className="h-4 w-4" /> Envoyer un autre
                  </Button>
                  <Button onClick={() => navigate("/profil")} className="flex-1 bg-pink-500 hover:bg-pink-600 gap-2">
                    Mon profil <ArrowUpRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>

          {/* =============== CLAIM TAB =============== */}
          <TabsContent value="claim" className="space-y-6">
            <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/10 p-5 space-y-2">
              <div className="flex items-center gap-2">
                <Download className="h-5 w-5 text-emerald-500" />
                <h3 className="font-semibold">Réclamer un cadeau</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                Vous avez reçu un code cadeau ? Entrez-le ci-dessous pour créditer les points sur votre compte.
              </p>
            </div>

            <div className="space-y-3">
              <Label className="font-semibold">Code cadeau</Label>
              <Input
                value={claimCode}
                onChange={(e) => setClaimCode(e.target.value)}
                placeholder="Entrez votre code cadeau..."
                className="font-mono text-center text-lg tracking-widest"
              />
            </div>

            <Button
              onClick={() => claimGiftMutation.mutate()}
              disabled={claimCode.trim().length < 6 || claimGiftMutation.isPending}
              className="w-full bg-emerald-500 hover:bg-emerald-600 gap-2"
              size="lg"
            >
              {claimGiftMutation.isPending ? (
                <div className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Vérification...
                </div>
              ) : (
                <>
                  <Download className="h-4 w-4" /> Réclamer mes points
                </>
              )}
            </Button>

            <div className="rounded-lg bg-amber-500/5 border border-amber-500/10 p-3 flex items-start gap-2 text-xs text-muted-foreground">
              <AlertCircle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
              <p>Les codes cadeau sont valables 30 jours à partir de leur création. Un code ne peut être utilisé qu'une seule fois.</p>
            </div>
          </TabsContent>

          {/* =============== HISTORY TAB =============== */}
          <TabsContent value="history" className="space-y-6">
            <Tabs defaultValue="sent">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="sent">Envoyés ({sentGifts?.length || 0})</TabsTrigger>
                <TabsTrigger value="received">Reçus ({receivedGifts?.length || 0})</TabsTrigger>
              </TabsList>

              <TabsContent value="sent" className="space-y-3 pt-4">
                {sentGifts && sentGifts.length > 0 ? (
                  sentGifts.map((gift: any) => (
                    <div key={gift.id} className="flex items-center justify-between p-3 border rounded-xl bg-card">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${gift.status === "claimed" ? "bg-emerald-500/10" : gift.status === "expired" ? "bg-red-500/10" : "bg-amber-500/10"
                          }`}>
                          <Send className={`h-4 w-4 ${gift.status === "claimed" ? "text-emerald-500" : gift.status === "expired" ? "text-red-500" : "text-amber-500"
                            }`} />
                        </div>
                        <div>
                          <p className="font-semibold text-sm">{gift.recipient_email}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(gift.created_at).toLocaleDateString("fr-FR")}
                            {gift.message && ` · "${gift.message.slice(0, 30)}${gift.message.length > 30 ? "..." : ""}"`}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-sm text-pink-600 dark:text-pink-400">-{gift.points_amount.toLocaleString()} pts</p>
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${gift.status === "claimed" ? "border-emerald-500 text-emerald-600 dark:text-emerald-400" :
                              gift.status === "expired" ? "border-red-500 text-red-600 dark:text-red-400" :
                                "border-amber-500 text-amber-600 dark:text-amber-400"
                            }`}
                        >
                          {gift.status === "claimed" ? "Réclamé" : gift.status === "expired" ? "Expiré" : "En attente"}
                        </Badge>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-muted-foreground space-y-2">
                    <Send className="h-8 w-8 mx-auto opacity-30" />
                    <p className="text-sm">Aucun cadeau envoyé</p>
                    <p className="text-xs">Offrez des Miamz à vos proches !</p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="received" className="space-y-3 pt-4">
                {receivedGifts && receivedGifts.length > 0 ? (
                  receivedGifts.map((gift: any) => (
                    <div key={gift.id} className="flex items-center justify-between p-3 border rounded-xl bg-card">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center">
                          <Download className="h-4 w-4 text-emerald-500" />
                        </div>
                        <div>
                          <p className="font-semibold text-sm">Cadeau reçu</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(gift.claimed_at || gift.created_at).toLocaleDateString("fr-FR")}
                            {gift.message && ` · "${gift.message.slice(0, 30)}${gift.message.length > 30 ? "..." : ""}"`}
                          </p>
                        </div>
                      </div>
                      <p className="font-bold text-sm text-emerald-600 dark:text-emerald-400">+{gift.points_amount.toLocaleString()} pts</p>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-muted-foreground space-y-2">
                    <Download className="h-8 w-8 mx-auto opacity-30" />
                    <p className="text-sm">Aucun cadeau reçu</p>
                    <p className="text-xs">Partagez votre lien avec vos amis !</p>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </TabsContent>
        </Tabs>

        {/* Solidarity CTA */}
        <div className="rounded-2xl bg-gradient-to-r from-green-500/5 to-emerald-500/5 border border-green-500/10 p-6 space-y-3">
          <div className="flex items-center gap-3">
            <Heart className="h-6 w-6 text-green-600 dark:text-green-400 fill-green-600" />
            <div>
              <h3 className="font-semibold">Don solidaire</h3>
              <p className="text-xs text-muted-foreground">Vos points peuvent aussi nourrir ceux qui en ont besoin</p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Pour chaque 1000 points donnés, un repas est offert à une personne dans le besoin via notre programme solidaire.
          </p>
          <Button variant="outline" className="w-full border-green-500 text-green-600 dark:text-green-400 hover:bg-green-500/10 gap-2" onClick={() => navigate("/panier")}>
            <Heart className="h-4 w-4" /> Faire un don lors de ma prochaine commande
          </Button>
        </div>
      </div>
    </main>
  );
}
