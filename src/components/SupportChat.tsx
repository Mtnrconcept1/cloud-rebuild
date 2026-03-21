import { useEffect, useRef, useState } from "react";
import { Mail, Phone, Send, User, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Node = {
  id: string;
  text: string;
  options?: { label: string; next: string }[];
  final?: boolean;
};

const CHAT_TREE: Record<string, Node> = {
  start: {
    id: "start",
    text: "Bonjour. Comment pouvons-nous vous aider pour votre reservation ?",
    options: [
      { label: "Modifier ma reservation", next: "edit_reservation" },
      { label: "Annuler ma reservation", next: "cancel_reservation" },
      { label: "Probleme de paiement", next: "payment" },
      { label: "Autre demande", next: "other" },
    ],
  },
  edit_reservation: {
    id: "edit_reservation",
    text: "Vous pouvez consulter vos reservations depuis l'onglet \"Mes reservations\" et ouvrir le detail pour verifier les informations disponibles.",
    options: [
      { label: "Voir mes reservations", next: "end_satisfied" },
      { label: "Contacter un agent", next: "contact_final" },
    ],
  },
  cancel_reservation: {
    id: "cancel_reservation",
    text: "L'annulation est disponible depuis le detail de reservation lorsqu'elle respecte le delai autorise par le restaurant.",
    options: [
      { label: "J'ai compris", next: "end_satisfied" },
      { label: "J'ai besoin d'aide", next: "contact_final" },
    ],
  },
  payment: {
    id: "payment",
    text: "Si un paiement de reservation a echoue, verifiez votre moyen de paiement puis reessayez. Si le probleme persiste, nous pouvons vous aider.",
    options: [
      { label: "Contacter un agent", next: "contact_final" },
      { label: "C'est resolu", next: "end_satisfied" },
    ],
  },
  other: {
    id: "other",
    text: "Dites-m'en plus ou discutez avec un de nos agents.",
    options: [{ label: "Parler a un agent", next: "contact_final" }],
  },
  contact_final: {
    id: "contact_final",
    text: "Voici les moyens de nous joindre directement :",
    final: true,
  },
  end_satisfied: {
    id: "end_satisfied",
    text: "Parfait. Bonne reservation.",
    final: true,
  },
};

export default function SupportChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [history, setHistory] = useState<{ type: "bot" | "user"; text: string; options?: Node["options"] }[]>([
    { type: "bot", text: CHAT_TREE.start.text, options: CHAT_TREE.start.options },
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [history]);

  useEffect(() => {
    (window as any).openChat = () => setIsOpen(true);
    return () => {
      (window as any).openChat = undefined;
    };
  }, []);

  const handleOption = (option: { label: string; next: string }) => {
    const nextNode = CHAT_TREE[option.next];
    setHistory((current) => [
      ...current,
      { type: "user", text: option.label },
      { type: "bot", text: nextNode.text, options: nextNode.options },
    ]);
  };

  const resetChat = () => {
    setHistory([{ type: "bot", text: CHAT_TREE.start.text, options: CHAT_TREE.start.options }]);
    setInputValue("");
    setIsTyping(false);
  };

  const handleSendMessage = (event: React.FormEvent) => {
    event.preventDefault();
    if (!inputValue.trim() || isTyping) return;

    const userMessage = inputValue.trim();
    setInputValue("");
    setHistory((current) => [...current, { type: "user", text: userMessage }]);
    setIsTyping(true);

    setTimeout(() => {
      setHistory((current) => [
        ...current,
        {
          type: "bot",
          text: "Merci pour votre message. Un agent reviendra vers vous rapidement.",
          options: [{ label: "Voir les contacts", next: "contact_final" }],
        },
      ]);
      setIsTyping(false);
    }, 1200);
  };

  return (
    <>
      {isOpen ? <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" onClick={() => setIsOpen(false)} /> : null}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-4 sm:bottom-6 sm:right-6">
        {isOpen ? (
          <div className="flex h-[min(500px,calc(100vh-6rem))] w-[min(350px,calc(100vw-2rem))] animate-in flex-col overflow-hidden rounded-3xl border bg-card shadow-2xl md:w-[400px]">
            <div className="flex items-center justify-between bg-primary p-4 text-primary-foreground">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20">
                  <User className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm font-bold">Assistant Deliveroom</p>
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-green-400" />
                    <span className="text-[10px] font-bold uppercase tracking-widest opacity-80">En ligne</span>
                  </div>
                </div>
              </div>
              <button onClick={() => setIsOpen(false)} className="rounded-full p-1.5 transition-colors hover:bg-white/10">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto bg-muted/20 p-4">
              {history.map((message, index) => (
                <div key={index} className={`flex ${message.type === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] rounded-2xl p-3 text-sm shadow-sm ${message.type === "user" ? "rounded-br-none bg-primary text-primary-foreground" : "rounded-bl-none border bg-card"}`}>
                    {message.text}
                    {message.options ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {message.options.map((option, optionIndex) => (
                          <Button key={optionIndex} variant="outline" size="sm" onClick={() => handleOption(option)} className="rounded-full text-xs">
                            {option.label}
                          </Button>
                        ))}
                      </div>
                    ) : null}
                    {message.type === "bot" && !message.options && index === history.length - 1 ? (
                      <div className="mt-4 space-y-2">
                        <div className="space-y-2 rounded-xl border border-primary/10 bg-primary/5 p-3">
                          <a href="mailto:support@deliveroom.ch" className="flex items-center gap-2 font-bold text-primary hover:underline">
                            <Mail className="h-4 w-4" />
                            support@deliveroom.ch
                          </a>
                          <a href="tel:+33123456789" className="flex items-center gap-2 font-bold text-primary hover:underline">
                            <Phone className="h-4 w-4" />
                            +33 1 23 45 67 89
                          </a>
                        </div>
                        <Button variant="ghost" size="sm" onClick={resetChat} className="w-full gap-1 text-xs opacity-70">
                          Recommencer
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t bg-card p-4">
              {!history[history.length - 1].options && !isTyping ? (
                <div className="mb-2 text-center">
                  <Badge variant="outline" className="text-[10px] uppercase tracking-tighter opacity-50">
                    Support reservation actif
                  </Badge>
                </div>
              ) : null}
              {isTyping ? (
                <div className="mb-4 flex gap-1 animate-pulse">
                  <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                  <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                  <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                </div>
              ) : null}
              <form onSubmit={handleSendMessage} className="flex gap-2">
                <Input
                  value={inputValue}
                  onChange={(event) => setInputValue(event.target.value)}
                  placeholder="Ecrivez votre message..."
                  className="h-10 rounded-full border-0 bg-muted/50 text-xs focus-visible:ring-1 focus-visible:ring-primary/30"
                  disabled={isTyping}
                />
                <Button type="submit" size="icon" className="h-10 w-10 shrink-0 rounded-full" disabled={!inputValue.trim() || isTyping}>
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}
