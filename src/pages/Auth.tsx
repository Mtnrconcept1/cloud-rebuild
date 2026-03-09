import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { LOGO_URL } from "@/lib/constants";

export default function Auth() {
  const [searchParams] = useSearchParams();
  const initialRole = searchParams.get("type") === "restaurateur" ? "restaurateur" : "client";
  const initialIsLogin = searchParams.get("type") !== "restaurateur";

  const [isLogin, setIsLogin] = useState(initialIsLogin);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [roleMode, setRoleMode] = useState(initialRole);
  const [loading, setLoading] = useState(false);
  const [forgotPassword, setForgotPassword] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleResetPassword = async () => {
    if (!email.trim()) return toast({ title: "Entrez votre email", variant: "destructive" });
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth`,
    });
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Email envoyé", description: "Vérifiez votre boîte mail pour réinitialiser votre mot de passe." });
      setForgotPassword(false);
    }
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (isLogin) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        toast({ title: "Erreur", description: error.message, variant: "destructive" });
      } else {
        navigate("/");
      }
    } else {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName, role: roleMode },
          emailRedirectTo: window.location.origin,
        },
      });
      if (error) {
        toast({ title: "Erreur", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Compte créé !", description: "Vérifiez votre email pour confirmer votre inscription." });
      }
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-secondary/10 px-4">
      <Card className="w-full max-w-md shadow-lg border-0">
        <CardHeader className="text-center space-y-2">
          <img src={LOGO_URL} alt="Miamz" className="mx-auto h-20 w-auto object-contain mb-2" />
          <CardTitle className="font-display text-2xl">{isLogin ? "Bon retour !" : "Créer un compte"}</CardTitle>
          <CardDescription>{isLogin ? "Connectez-vous pour accéder à vos restaurants favoris" : "Rejoignez Miamz et découvrez les meilleurs restaurants"}</CardDescription>
        </CardHeader>
        <CardContent>
          {!isLogin && (
            <div className="mb-6 space-y-2">
              <Tabs defaultValue="client" value={roleMode} onValueChange={setRoleMode} className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="client">Client</TabsTrigger>
                  <TabsTrigger value="restaurateur">Restaurateur</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          )}

          {forgotPassword ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="resetEmail">Email</Label>
                <Input id="resetEmail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vous@exemple.com" required />
              </div>
              <Button className="w-full" onClick={handleResetPassword} disabled={loading}>
                {loading ? "Envoi..." : "Réinitialiser le mot de passe"}
              </Button>
              <button type="button" onClick={() => setForgotPassword(false)} className="w-full text-sm text-muted-foreground hover:text-primary transition-colors">
                Retour à la connexion
              </button>
            </div>
          ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div className="space-y-2">
                <Label htmlFor="fullName">{roleMode === "client" ? "Nom complet" : "Nom du responsable"}</Label>
                <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jean Dupont" required={!isLogin} />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vous@exemple.com" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Mot de passe</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Chargement..." : isLogin ? "Se connecter" : "S'inscrire"}
            </Button>
          </form>
          {isLogin && (
            <div className="mt-2 text-center">
              <button type="button" onClick={() => setForgotPassword(true)} className="text-xs text-muted-foreground hover:text-primary transition-colors">
                Mot de passe oublié ?
              </button>
            </div>
          )}
          </form>
          )}
          <div className="mt-4 text-center">
            <button type="button" onClick={() => { setIsLogin(!isLogin); setForgotPassword(false); }} className="text-sm text-muted-foreground hover:text-primary transition-colors">
              {isLogin ? "Pas encore de compte ? S'inscrire" : "Déjà un compte ? Se connecter"}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}