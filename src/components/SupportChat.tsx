import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Mail, MessageSquare, Send, User, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { appendSupportMessage, createSupportTicket, type SupportTicketRow } from "@/lib/support";

export default function SupportChat() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [newSubject, setNewSubject] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [reply, setReply] = useState("");
  const [creating, setCreating] = useState(false);
  const [sending, setSending] = useState(false);

  const { data: tickets = [], refetch } = useQuery({
    queryKey: ["support-chat-tickets", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("support_tickets")
        .select("id, subject, category, priority, status, description, created_at, updated_at, support_messages(id, content, created_at, sender_id, sender_role)")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []) as SupportTicketRow[];
    },
    enabled: !!user,
  });

  useEffect(() => {
    if ((window as any).openChat) return;
    (window as any).openChat = () => setIsOpen(true);
    return () => {
      (window as any).openChat = undefined;
    };
  }, []);

  useEffect(() => {
    if (selectedTicketId || tickets.length === 0) return;
    setSelectedTicketId(tickets[0].id);
  }, [selectedTicketId, tickets]);

  const selectedTicket = useMemo(
    () => tickets.find((ticket) => ticket.id === selectedTicketId) || null,
    [selectedTicketId, tickets],
  );

  const sortedMessages = useMemo(
    () =>
      [...(selectedTicket?.support_messages || [])].sort(
        (left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime(),
      ),
    [selectedTicket],
  );

  const handleCreateTicket = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!newSubject.trim() || !newMessage.trim()) {
      toast({ title: "Validation", description: "Sujet et message requis.", variant: "destructive" });
      return;
    }

    setCreating(true);
    try {
      const ticketId = await createSupportTicket({
        subject: newSubject.trim(),
        description: newMessage.trim(),
        category: "general",
        source: "support_chat",
      });
      setNewSubject("");
      setNewMessage("");
      await refetch();
      setSelectedTicketId(ticketId);
      toast({ title: "Ticket créé" });
    } catch (error) {
      toast({
        title: "Erreur",
        description: error instanceof Error ? error.message : "Impossible de créer le ticket.",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  const handleSendReply = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedTicket || !reply.trim()) return;

    setSending(true);
    try {
      await appendSupportMessage(selectedTicket.id, reply.trim());
      setReply("");
      await refetch();
    } catch (error) {
      toast({
        title: "Erreur",
        description: error instanceof Error ? error.message : "Impossible d'envoyer le message.",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      {isOpen ? <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" onClick={() => setIsOpen(false)} /> : null}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-4 sm:bottom-6 sm:right-6">
        <Button className="rounded-full shadow-xl" onClick={() => setIsOpen((current) => !current)}>
          <MessageSquare className="mr-2 h-4 w-4" />
          Support
        </Button>

        {isOpen ? (
          <div className="flex h-[min(560px,calc(100vh-6rem))] w-[min(420px,calc(100vw-2rem))] flex-col overflow-hidden rounded-3xl border bg-card shadow-2xl">
            <div className="flex items-center justify-between bg-primary p-4 text-primary-foreground">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20">
                  <User className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm font-bold">Support Tok</p>
                  <p className="text-[10px] uppercase tracking-widest text-primary-foreground/80">
                    Tickets suivis
                  </p>
                </div>
              </div>
              <button onClick={() => setIsOpen(false)} className="rounded-full p-1.5 transition-colors hover:bg-white/10">
                <X className="h-5 w-5" />
              </button>
            </div>

            {!user ? (
              <div className="flex flex-1 flex-col justify-between p-4">
                <div className="space-y-3">
                  <p className="text-sm font-medium">Connectez-vous pour ouvrir un ticket suivi et échanger avec le support.</p>
                  <p className="text-sm text-muted-foreground">
                    Les demandes support sont maintenant tracées dans votre compte au lieu d'utiliser un chat simulé.
                  </p>
                </div>
                <div className="space-y-3">
                  <Button asChild className="w-full">
                    <Link to="/auth">Se connecter</Link>
                  </Button>
                  <a href="mailto:support@tok.ch" className="flex items-center justify-center gap-2 text-sm font-medium text-primary hover:underline">
                    <Mail className="h-4 w-4" />
                    support@tok.ch
                  </a>
                </div>
              </div>
            ) : (
              <>
                <div className="border-b p-4">
                  <form onSubmit={handleCreateTicket} className="space-y-3">
                    <Input value={newSubject} onChange={(event) => setNewSubject(event.target.value)} placeholder="Sujet de votre demande" />
                    <Textarea value={newMessage} onChange={(event) => setNewMessage(event.target.value)} placeholder="Décrivez précisément votre problème..." rows={3} />
                    <Button type="submit" className="w-full" disabled={creating}>
                      {creating ? "Création..." : "Ouvrir un ticket"}
                    </Button>
                  </form>
                </div>

                <div className="grid flex-1 grid-cols-[150px,1fr] overflow-hidden">
                  <div className="overflow-y-auto border-r bg-muted/20 p-3">
                    <div className="space-y-2">
                      {tickets.map((ticket) => (
                        <button
                          key={ticket.id}
                          onClick={() => setSelectedTicketId(ticket.id)}
                          className={`w-full rounded-xl border p-3 text-left transition-colors ${
                            selectedTicketId === ticket.id ? "border-primary bg-primary/5" : "bg-card hover:border-primary/30"
                          }`}
                        >
                          <p className="line-clamp-2 text-sm font-semibold">{ticket.subject}</p>
                          <div className="mt-2 flex flex-wrap gap-1">
                            <Badge variant="outline" className="text-[10px]">{ticket.status}</Badge>
                            <Badge variant="secondary" className="text-[10px]">{ticket.priority}</Badge>
                          </div>
                        </button>
                      ))}
                      {tickets.length === 0 ? <p className="text-xs text-muted-foreground">Aucun ticket pour le moment.</p> : null}
                    </div>
                  </div>

                  <div className="flex min-h-0 flex-col">
                    {selectedTicket ? (
                      <>
                        <div className="border-b px-4 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="font-semibold">{selectedTicket.subject}</p>
                              <p className="text-xs text-muted-foreground">{selectedTicket.category}</p>
                            </div>
                            <Badge>{selectedTicket.status}</Badge>
                          </div>
                        </div>

                        <div className="flex-1 space-y-3 overflow-y-auto bg-muted/10 p-4">
                          {sortedMessages.map((message) => {
                            const ownMessage = message.sender_id === user.id;
                            return (
                              <div key={message.id} className={`flex ${ownMessage ? "justify-end" : "justify-start"}`}>
                                <div className={`max-w-[85%] rounded-2xl p-3 text-sm ${ownMessage ? "rounded-br-none bg-primary text-primary-foreground" : "rounded-bl-none border bg-card"}`}>
                                  <p>{message.content}</p>
                                  <p className={`mt-2 text-[10px] ${ownMessage ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                                    {new Date(message.created_at).toLocaleString("fr-FR")}
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                          {sortedMessages.length === 0 ? <p className="text-sm text-muted-foreground">Aucun message dans ce ticket.</p> : null}
                        </div>

                        <div className="border-t p-4">
                          <form onSubmit={handleSendReply} className="flex gap-2">
                            <Input value={reply} onChange={(event) => setReply(event.target.value)} placeholder="Ajouter un message..." disabled={sending} />
                            <Button type="submit" size="icon" disabled={!reply.trim() || sending}>
                              <Send className="h-4 w-4" />
                            </Button>
                          </form>
                        </div>
                      </>
                    ) : (
                      <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
                        Sélectionnez un ticket pour afficher l'historique.
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        ) : null}
      </div>
    </>
  );
}
