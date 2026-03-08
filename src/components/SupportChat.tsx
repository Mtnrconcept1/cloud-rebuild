import { useState, useEffect, useRef } from "react";
import { X, Send, User, Phone, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

type Node = { id: string; text: string; options?: { label: string; next: string }[]; final?: boolean; };

const CHAT_TREE: Record<string, Node> = {
  start: { id: "start", text: "Bonjour ! Comment l'équipe Miamz peut-elle vous aider aujourd'hui ?", options: [{ label: "Où est ma commande ?", next: "order_status" }, { label: "Problème de paiement", next: "payment" }, { label: "Miamz One", next: "membership" }, { label: "Autre chose", next: "other" }] },
  order_status: { id: "order_status", text: "Patience ! Vous pouvez suivre le trajet en direct dans l'onglet 'Commandes'. Le livreur respecte-t-il le délai ?", options: [{ label: "Oui, je regarde", next: "end_satisfied" }, { label: "Non, c'est en retard", next: "order_late" }] },
  order_late: { id: "order_late", text: "Nous sommes désolés pour ce retard. Souhaitez-vous contacter le support pour un geste commercial ?", options: [{ label: "Oui", next: "contact_final" }, { label: "Non, j'attends", next: "end_satisfied" }] },
  payment: { id: "payment", text: "Les paiements sont sécurisés. Un bug lors du paiement ? Vérifiez votre plafond ou contactez votre banque.", options: [{ label: "Toujours bloqué", next: "contact_final" }, { label: "C'est résolu", next: "end_satisfied" }] },
  membership: { id: "membership", text: "Miamz One vous offre la livraison illimitée ! Souhaitez-vous gérer votre abonnement ?", options: [{ label: "Oui, comment faire ?", next: "membership_how" }, { label: "Non, simple question", next: "contact_final" }] },
  membership_how: { id: "membership_how", text: "Rendez-vous dans votre Profil > Abonnement pour gérer vos options.", options: [{ label: "Merci !", next: "end_satisfied" }] },
  other: { id: "other", text: "Dites-m'en plus ou discutez avec un de nos agents.", options: [{ label: "Parler à un agent", next: "contact_final" }] },
  contact_final: { id: "contact_final", text: "Voici les moyens de nous joindre directement :", final: true },
  end_satisfied: { id: "end_satisfied", text: "Génial ! Bon appétit avec Miamz ! 🍔", final: true },
};

export default function SupportChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [history, setHistory] = useState<{ type: 'bot' | 'user'; text: string; options?: Node['options'] }[]>([
    { type: 'bot', text: CHAT_TREE.start.text, options: CHAT_TREE.start.options }
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [history]);
  useEffect(() => { (window as any).openChat = () => setIsOpen(true); return () => { (window as any).openChat = undefined; }; }, []);

  const handleOption = (option: { label: string; next: string }) => {
    const nextNode = CHAT_TREE[option.next];
    setHistory(prev => [...prev, { type: 'user', text: option.label }, { type: 'bot', text: nextNode.text, options: nextNode.options }]);
  };

  const resetChat = () => { setHistory([{ type: 'bot', text: CHAT_TREE.start.text, options: CHAT_TREE.start.options }]); setInputValue(""); setIsTyping(false); };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isTyping) return;
    const userMsg = inputValue.trim();
    setInputValue("");
    setHistory(prev => [...prev, { type: 'user', text: userMsg }]);
    setIsTyping(true);
    setTimeout(() => {
      setHistory(prev => [...prev, { type: 'bot', text: "Merci pour votre message. Un opérateur va prendre le relais et vous répondra dans les plus brefs délais.", options: [{ label: "Consulter la FAQ", next: "contact_final" }] }]);
      setIsTyping(false);
    }, 1500);
  };

  return (
    <>
      {isOpen && <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" onClick={() => setIsOpen(false)} />}
      <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 flex flex-col items-end gap-4">
        {isOpen && (
          <div className="w-[min(350px,calc(100vw-2rem))] md:w-[400px] h-[min(500px,calc(100vh-6rem))] bg-card border rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-5">
            <div className="bg-primary p-4 text-primary-foreground flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center"><User className="h-6 w-6" /></div>
                <div>
                  <p className="font-bold text-sm">Assistant Miamz</p>
                  <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" /><span className="text-[10px] opacity-80 uppercase tracking-widest font-bold">En ligne</span></div>
                </div>
              </div>
              <button onClick={() => setIsOpen(false)} className="hover:bg-white/10 p-1.5 rounded-full transition-colors"><X className="h-5 w-5" /></button>
            </div>
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-muted/20">
              {history.map((msg, i) => (
                <div key={i} className={`flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in duration-300`}>
                  <div className={`max-w-[85%] p-3 rounded-2xl text-sm shadow-sm ${msg.type === 'user' ? 'bg-primary text-primary-foreground rounded-br-none' : 'bg-card border rounded-bl-none'}`}>
                    {msg.text}
                    {msg.options && (
                      <div className="flex flex-wrap gap-2 mt-3">
                        {msg.options.map((opt, j) => (
                          <Button key={j} variant="outline" size="sm" onClick={() => handleOption(opt)} className="text-xs rounded-full">{opt.label}</Button>
                        ))}
                      </div>
                    )}
                    {msg.type === 'bot' && !msg.options && i === history.length - 1 && (
                      <div className="mt-4 space-y-2">
                        <div className="p-3 bg-primary/5 rounded-xl space-y-2 border border-primary/10">
                          <a href="mailto:support@miamz.ch" className="flex items-center gap-2 text-primary font-bold hover:underline"><Mail className="h-4 w-4" /> support@miamz.ch</a>
                          <a href="tel:+33123456789" className="flex items-center gap-2 text-primary font-bold hover:underline"><Phone className="h-4 w-4" /> +33 1 23 45 67 89</a>
                        </div>
                        <Button variant="ghost" size="sm" onClick={resetChat} className="w-full text-xs gap-1 opacity-70">Recommencer</Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="p-4 bg-card border-t">
              {!history[history.length - 1].options && !isTyping && (
                <div className="text-center mb-2"><Badge variant="outline" className="text-[10px] opacity-50 uppercase tracking-tighter">Support direct activé</Badge></div>
              )}
              {isTyping && <div className="flex gap-1 mb-4 animate-pulse"><div className="w-1.5 h-1.5 bg-primary rounded-full"></div><div className="w-1.5 h-1.5 bg-primary rounded-full"></div><div className="w-1.5 h-1.5 bg-primary rounded-full"></div></div>}
              <form onSubmit={handleSendMessage} className="flex gap-2">
                <Input value={inputValue} onChange={(e) => setInputValue(e.target.value)} placeholder="Écrivez votre message..." className="rounded-full bg-muted/50 border-0 focus-visible:ring-1 focus-visible:ring-primary/30 h-10 text-xs" disabled={isTyping} />
                <Button type="submit" size="icon" className="rounded-full shrink-0 h-10 w-10" disabled={!inputValue.trim() || isTyping}><Send className="h-4 w-4" /></Button>
              </form>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
